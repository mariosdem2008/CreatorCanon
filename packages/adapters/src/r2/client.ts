import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AtlasError } from '@atlas/core';
import type { ServerEnv } from '@atlas/core';
import { z } from 'zod';

const nonEmpty = z.string().min(1);

const putObjectSchema = z.object({
  key: nonEmpty,
  body: z.union([z.instanceof(Uint8Array), z.instanceof(Buffer), z.string()]),
  contentType: z.string().min(1).optional(),
  /** Optional object metadata (string → string). */
  metadata: z.record(z.string()).optional(),
  /** Optional cache-control header for objects served via the public base URL. */
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
  /** TTL in seconds for the presigned URL. */
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
  /** The underlying S3 client, exposed for advanced callers (multipart, etc.). */
  readonly s3: S3Client;
  /** Configured bucket name. */
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

const notImplemented = (op: string): AtlasError =>
  new AtlasError({
    code: 'not_implemented',
    category: 'internal',
    message: `R2Client.${op} is not implemented yet (lands in Epic 5).`,
  });

/**
 * Build an R2 (S3-compatible) client configured for a workspace's bucket.
 *
 * Reads exclusively from the passed `env` — never touches `process.env`.
 * The endpoint follows Cloudflare's `https://<account_id>.r2.cloudflarestorage.com`
 * convention and signs requests with `region: 'auto'`.
 */
export const createR2Client = (env: ServerEnv): R2Client => {
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
      putObjectSchema.parse(input);
      throw notImplemented('putObject');
      // Implementation (Epic 5):
      // const cmd = new PutObjectCommand({
      //   Bucket: bucket, Key: input.key, Body: input.body,
      //   ContentType: input.contentType, Metadata: input.metadata,
      //   CacheControl: input.cacheControl,
      // });
      // const res = await s3.send(cmd);
      // return { key: input.key, etag: res.ETag };
    },
    async getObject(_key) {
      nonEmpty.parse(_key);
      throw notImplemented('getObject');
      // const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: _key }));
      // ...
    },
    async getSignedUrl(input) {
      const parsed = signedUrlSchema.parse(input);
      // Wired to the real SDK so Epic 5 only needs to flip the throw off;
      // today we still throw to preserve the consistent not_implemented contract.
      void parsed;
      void getSignedUrl;
      void GetObjectCommand;
      void PutObjectCommand;
      throw notImplemented('getSignedUrl');
    },
    async deleteObject(_key) {
      nonEmpty.parse(_key);
      throw notImplemented('deleteObject');
      // await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: _key }));
    },
    async headObject(_key) {
      nonEmpty.parse(_key);
      throw notImplemented('headObject');
      // const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: _key }));
      // ...
    },
    async listObjects(_input) {
      throw notImplemented('listObjects');
      // const res = await s3.send(new ListObjectsV2Command({
      //   Bucket: bucket, Prefix: _input.prefix,
      //   ContinuationToken: _input.continuationToken,
      //   MaxKeys: _input.maxKeys,
      // }));
      // ...
    },
  };
};
