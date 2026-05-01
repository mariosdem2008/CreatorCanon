import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ServerEnv } from '@creatorcanon/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const nonEmpty = z.string().min(1);

const putObjectSchema = z.object({
  key: nonEmpty,
  body: z.union([z.instanceof(Uint8Array), z.instanceof(Buffer), z.string()]),
  contentType: z.string().min(1).optional(),
  metadata: z.record(z.string()).optional(),
  cacheControl: z.string().optional(),
});

export type R2PutObjectInput = z.infer<typeof putObjectSchema>;

export interface R2GetObjectOutput {
  key: string;
  body: Uint8Array;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

const signedUrlSchema = z.object({
  key: nonEmpty,
  operation: z.enum(['get', 'put']).default('get'),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).default(60 * 15),
  contentType: z.string().optional(),
});

export type R2SignedUrlInput = z.infer<typeof signedUrlSchema>;

export interface R2HeadObjectOutput {
  key: string;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface R2ListObjectsOutput {
  keys: string[];
  nextContinuationToken?: string;
  isTruncated: boolean;
}

export interface R2Client {
  readonly s3?: S3Client;
  readonly bucket: string;

  putObject(input: R2PutObjectInput): Promise<{ key: string; etag?: string }>;
  getObject(key: string): Promise<R2GetObjectOutput>;
  getSignedUrl(input: R2SignedUrlInput): Promise<string>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<R2HeadObjectOutput>;
  listObjects(input: {
    prefix: string;
    continuationToken?: string;
    maxKeys?: number;
  }): Promise<R2ListObjectsOutput>;
}

function safeLocalPath(root: string, key: string): string {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, key);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Invalid local artifact key: ${key}`);
  }
  return target;
}

export const createR2Client = (env: ServerEnv): R2Client => {
  if (env.ARTIFACT_STORAGE === 'local') {
    const root = path.resolve(process.cwd(), env.LOCAL_ARTIFACT_DIR);
    const bucket = env.R2_BUCKET || 'local-artifacts';

    return {
      bucket,

      async putObject(input) {
        const parsed = putObjectSchema.parse(input);
        const target = safeLocalPath(root, parsed.key);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const body = typeof parsed.body === 'string'
          ? new TextEncoder().encode(parsed.body)
          : new Uint8Array(parsed.body);
        await fs.writeFile(target, body);
        if (parsed.contentType || parsed.metadata || parsed.cacheControl) {
          await fs.writeFile(`${target}.meta.json`, JSON.stringify({
            contentType: parsed.contentType,
            metadata: parsed.metadata,
            cacheControl: parsed.cacheControl,
          }, null, 2));
        }
        return { key: parsed.key, etag: `local-${body.byteLength}` };
      },

      async getObject(key) {
        nonEmpty.parse(key);
        const target = safeLocalPath(root, key);
        const [bodyBuffer, stats, metaRaw] = await Promise.all([
          fs.readFile(target),
          fs.stat(target),
          fs.readFile(`${target}.meta.json`, 'utf8').catch(() => undefined),
        ]);
        const body = new Uint8Array(bodyBuffer);
        const meta = metaRaw ? JSON.parse(metaRaw) as {
          contentType?: string;
          metadata?: Record<string, string>;
        } : {};
        return {
          key,
          body,
          contentType: meta.contentType,
          etag: `local-${body.byteLength}`,
          lastModified: stats.mtime,
          metadata: meta.metadata,
        };
      },

      async getSignedUrl(input) {
        const parsed = signedUrlSchema.parse(input);
        return `file://${safeLocalPath(root, parsed.key)}`;
      },

      async deleteObject(key) {
        nonEmpty.parse(key);
        const target = safeLocalPath(root, key);
        await fs.rm(target, { force: true });
        await fs.rm(`${target}.meta.json`, { force: true });
      },

      async headObject(key) {
        nonEmpty.parse(key);
        const target = safeLocalPath(root, key);
        const [stats, metaRaw] = await Promise.all([
          fs.stat(target),
          fs.readFile(`${target}.meta.json`, 'utf8').catch(() => undefined),
        ]);
        const meta = metaRaw ? JSON.parse(metaRaw) as {
          contentType?: string;
          metadata?: Record<string, string>;
        } : {};
        return {
          key,
          contentLength: stats.size,
          contentType: meta.contentType,
          etag: `local-${stats.size}`,
          lastModified: stats.mtime,
          metadata: meta.metadata,
        };
      },

      async listObjects(input) {
        const prefixRoot = safeLocalPath(root, input.prefix);
        const keys: string[] = [];

        async function walk(dir: string): Promise<void> {
          const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await walk(full);
            } else if (!entry.name.endsWith('.meta.json')) {
              keys.push(path.relative(root, full).replace(/\\/g, '/'));
            }
          }
        }

        await walk(prefixRoot);
        return {
          keys: keys.slice(0, input.maxKeys ?? keys.length),
          isTruncated: input.maxKeys != null && keys.length > input.maxKeys,
        };
      },
    };
  }

  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  });

  const bucket = env.R2_BUCKET;

  return {
    s3,
    bucket,

    async putObject(input) {
      const parsed = putObjectSchema.parse(input);
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: parsed.key,
        Body: parsed.body,
        ContentType: parsed.contentType,
        Metadata: parsed.metadata,
        CacheControl: parsed.cacheControl,
      });
      const res = await s3.send(cmd);
      return { key: parsed.key, etag: res.ETag };
    },

    async getObject(key) {
      nonEmpty.parse(key);
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return {
        key,
        body: bytes ?? new Uint8Array(),
        contentType: res.ContentType,
        etag: res.ETag,
        lastModified: res.LastModified,
        metadata: res.Metadata as Record<string, string> | undefined,
      };
    },

    async getSignedUrl(input) {
      const parsed = signedUrlSchema.parse(input);
      if (parsed.operation === 'put') {
        const cmd = new PutObjectCommand({
          Bucket: bucket,
          Key: parsed.key,
          ContentType: parsed.contentType,
        });
        return getSignedUrl(s3, cmd, { expiresIn: parsed.expiresInSeconds });
      }
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: parsed.key });
      return getSignedUrl(s3, cmd, { expiresIn: parsed.expiresInSeconds });
    },

    async deleteObject(key) {
      nonEmpty.parse(key);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async headObject(key) {
      nonEmpty.parse(key);
      const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        key,
        contentLength: res.ContentLength,
        contentType: res.ContentType,
        etag: res.ETag,
        lastModified: res.LastModified,
        metadata: res.Metadata as Record<string, string> | undefined,
      };
    },

    async listObjects(input) {
      const res = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: input.prefix,
        ContinuationToken: input.continuationToken,
        MaxKeys: input.maxKeys,
      }));
      return {
        keys: (res.Contents ?? []).map((o) => o.Key ?? '').filter(Boolean),
        nextContinuationToken: res.NextContinuationToken,
        isTruncated: res.IsTruncated ?? false,
      };
    },
  };
};
