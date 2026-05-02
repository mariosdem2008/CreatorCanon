# Phase 8 — Cohort Creator Slate + Video URLs

> Operator-side reference for the Phase 8 cohort backfill (Task 8.13).
> 4 new creators × ~10 videos each = 42 total. yt-dlp commands below.

## Slate rationale

Replaces the original Phase 8 candidates (Naval / Nippard / Codie / Veritasium — all unreachable
behind teams/managers/scale) with 4 creators that:

1. **Preserve archetypal coverage** — all 4 archetypes covered, voice-mode 2/1/1 distribution maintained
2. **Are reachable** — every creator replies to DMs / has public email / is solo-operator
3. **Have a paid offer** the hub can plausibly funnel into — clearer ROI claim in outreach
4. **Have network leverage** — if they share, real reach lands

| Creator | Archetype | Voice mode | Paid offer | Outreach surface |
|---|---|---|---|---|
| **Nick Huber** | operator-coach | first_person | Sweaty Startup community ($499/yr), agency, real-estate fund | Twitter DM (replies daily) |
| **Jay Clouse** | instructional-craft | first_person | The Lab community ($497/yr), Creator Science podcast | Email + Twitter; audience IS our buyer ICP |
| **Dr. Layne Norton** | science-explainer | third_person_editorial | Carbon coaching app, Outwork program | Twitter (very active, engages with citations) |
| **Derek Sivers** | contemplative-thinker | hybrid | 4 books, courses, public mentor | hi@sive.rs (replies to every email — public reputation) |

---

## Download plan (operator-side, runs locally)

**Prerequisites:**
- `yt-dlp` installed (`pip install -U yt-dlp` or `brew install yt-dlp`)
- ~5-10 GB free in `$HOME/Downloads/yt/`
- Stable connection (42 videos × 720p ≈ 1-3 hours total)

**Run the 4 commands below.** Each downloads one creator's videos in parallel into a separate folder. You can run them concurrently in 4 terminal tabs, or sequentially (safer if your connection is metered).

---

## 1. Nick Huber (operator-coach × first_person)

**Channel:** https://www.youtube.com/c/sweatystartup
**Project title:** Nick Huber — The Operator's Playbook

| # | Title (abbreviated) | ~Length | Canon type |
|---|---|---|---|
| 1 | Every Business Needs To Solve These 2 Problems | 10 min | definition |
| 2 | You Have To Build a Business Where Normal People Can Thrive | 10 min | definition |
| 3 | The Truth About Company Culture | 10 min | principle |
| 4 | Elevate Your Sales Game with the Huber Method Pt. 1 (Ep 136) | 20 min | framework |
| 5 | Tactical Tips To Control Sales Calls (Ep 138) | 15 min | framework |
| 6 | The Truth About Delegation | 12 min | framework |
| 7 | The Moment That Changed My Life in Business Forever (Ep 142) | 10 min | lesson |
| 8 | Making Key Decisions & Managing Stress (EP 157) | 9 min | lesson |
| 9 | Why Delegation is Hard But Extremely Valuable | 12 min | lesson |
| 10 | 9 Minutes on How We Went from 1 to 60+ Locations at Bolt Storage (Ep 131) | 9 min | example |

```bash
mkdir -p "$HOME/Downloads/yt/huber" && yt-dlp -f "best[height<=720]" -o "$HOME/Downloads/yt/huber/%(title)s.%(ext)s" \
  https://www.youtube.com/watch?v=ukMW6dBQ684 \
  https://www.youtube.com/watch?v=QR5fF0iKK8M \
  https://www.youtube.com/watch?v=aM3mUtIWHOM \
  https://www.youtube.com/watch?v=l6FWkMuHICU \
  https://www.youtube.com/watch?v=AZ4hN81qRUs \
  https://www.youtube.com/watch?v=UG9TBi_wx08 \
  https://www.youtube.com/watch?v=N-eCXBv6SZw \
  https://www.youtube.com/watch?v=i2HfTg6K3rc \
  https://www.youtube.com/watch?v=IkhAVvk4CD8 \
  https://www.youtube.com/watch?v=mA9lEjy8b7w
```

---

## 2. Jay Clouse (instructional-craft × first_person)

**Channel:** https://www.youtube.com/@jay
**Project title:** Jay Clouse — The Creator Science Playbook

| # | Title (abbreviated) | ~Length | Canon type |
|---|---|---|---|
| 1 | How I Made $300,000+ Last Year in the Creator Economy | 25-30 min | case-study |
| 2 | How to Launch a Digital Product in 2025 (without ads) | 20-25 min | framework |
| 3 | The Unexpected Way Jay Clouse Made $460k With Memberships | 20-25 min | case-study |
| 4 | How Jay Clouse got 22,500 New Email Subscribers | 20-25 min | framework |
| 5 | How He Made $819,000 in 3 Years (With a Small Audience) | 25-35 min | case-study |
| 6 | Forget Courses, Launch This In 2025 To Survive AI | 30-40 min | principle |
| 7 | How Jay Clouse Built a $500,000 ARR Community (in Less than 2 Years) | 20-30 min | framework |
| 8 | How Jay Clouse Grew His Newsletter 7x in Two Years | 20-25 min | case-study |
| 9 | Building a 6-Figure Creator Business — Jay Clouse | 25-35 min | principle |
| 10 | How To Build An Online Community — Jay Clouse | 20-30 min | definition |

```bash
mkdir -p "$HOME/Downloads/yt/clouse" && yt-dlp -f "best[height<=720]" -o "$HOME/Downloads/yt/clouse/%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=d_o2rZbF_KI" \
  "https://www.youtube.com/watch?v=5SNNgXS3f_o" \
  "https://www.youtube.com/watch?v=_7lGIwquY1k" \
  "https://www.youtube.com/watch?v=arzyRQ4nVOk" \
  "https://www.youtube.com/watch?v=F0fZnJs3Sso" \
  "https://www.youtube.com/watch?v=ZpM1ub3M2Ko" \
  "https://www.youtube.com/watch?v=dqkgLKejKuI" \
  "https://www.youtube.com/watch?v=8yGLlUApMsE" \
  "https://www.youtube.com/watch?v=m5hmItZIE2U" \
  "https://www.youtube.com/watch?v=thJqBZGXfQw"
```

---

## 3. Dr. Layne Norton (science-explainer × third_person_editorial)

**Channel:** https://www.youtube.com/@BioLayne
**Project title:** Dr. Layne Norton — Evidence-Based Nutrition & Fitness Science

| # | Title (abbreviated) | ~Length | Canon type |
|---|---|---|---|
| 1 | New Study Says Protein Causes Heart Attacks? | 20 min | evidence-review |
| 2 | Seed Oils LOWER Inflammation? | 25 min | evidence-review |
| 3 | Is Ozempic Melting Muscle Off Your Body?! | 30 min | evidence-review |
| 4 | Intermittent Fasting SHORTENS Your Lifespan??? The Tables Have Turned! | 25 min | evidence-review |
| 5 | Does excess protein intake increase cancer risk through mTOR and IGF? | 20 min | definition |
| 6 | Creatine is SAFE! Case Closed! | 25 min | evidence-review |
| 7 | Intermittent Fasting is NOT Anti-Inflammatory | 20 min | evidence-review |
| 8 | Is This Study the Death of Protein Timing? | 22 min | framework/mechanism |
| 9 | Seed Oils! My Most Hated Video Ever | 35 min | evidence-review |
| 10 | Sugar is NOT Inflammatory | 20 min | definition |

```bash
mkdir -p "$HOME/Downloads/yt/norton" && yt-dlp -f "best[height<=720]" -o "$HOME/Downloads/yt/norton/%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=7t_FG54IT9E" \
  "https://www.youtube.com/watch?v=8ETN1lmMve4" \
  "https://www.youtube.com/watch?v=wweGMDd844k" \
  "https://www.youtube.com/watch?v=aKofXL7o2LU" \
  "https://www.youtube.com/watch?v=m9qptOOeC2g" \
  "https://www.youtube.com/watch?v=tRUahbgHfe0" \
  "https://www.youtube.com/watch?v=Nxs_ZWuNveQ" \
  "https://www.youtube.com/watch?v=QDWGl3Xos6Q" \
  "https://www.youtube.com/watch?v=L2fSaFnt0FM" \
  "https://www.youtube.com/watch?v=i3D1SMCw550"
```

---

## 4. Derek Sivers (contemplative-thinker × hybrid)

**Channel:** https://www.youtube.com/c/dereksivers (TED talks scattered across TED channel)
**Project title:** Derek Sivers — Useful Not True (Aphorisms for Work, Life, and Creative Independence)

| # | Title (abbreviated) | ~Length | Canon type |
|---|---|---|---|
| 1 | How to start a movement | 3 min | example/story |
| 2 | Keep your goals to yourself | 3 min | principle |
| 3 | Weird, or just different? | 2 min | contrarian-take |
| 4 | Hell Yeah or No | 3 min | framework |
| 5 | Obvious to you, amazing to others | 4 min | principle |
| 6 | TEDxPhnomPenh — Why You Need to Fail | 12 min | contrarian-take |
| 7 | The "good enough" life choice — TEDxTaipei 2012 | 15 min | contrarian-take |
| 8 | A crash course on the meaning of life (Ink Talks) | 18 min | framework |
| 9 | Uncommon Sense Part 1 of 8 (CD Baby lessons) | 6 min | example |
| 10 | Uncommon Sense Part 2 of 8 | 6 min | framework |
| 11 | How Derek Sivers built and sold CD Baby for $22m | 30 min | example |
| 12 | Derek Sivers: Useful Not True (2024 book talk) | 45 min | principle |

```bash
mkdir -p "$HOME/Downloads/yt/sivers" && yt-dlp -f "best[height<=720]" -o "$HOME/Downloads/yt/sivers/%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=V74AxCqOTvg" \
  "https://www.youtube.com/watch?v=NHopJHSlVo4" \
  "https://www.youtube.com/watch?v=1K5SycZjGhI" \
  "https://www.youtube.com/watch?v=1ehWlVeMrqw" \
  "https://www.youtube.com/watch?v=XSOaagxk3xs" \
  "https://www.youtube.com/watch?v=AWwDzHFSyLs" \
  "https://www.youtube.com/watch?v=6aTaoGWjMvI" \
  "https://www.youtube.com/watch?v=0u9UzZAHrME" \
  "https://www.youtube.com/watch?v=NUJir-MTmJY" \
  "https://www.youtube.com/watch?v=cKrqPZlLCts" \
  "https://www.youtube.com/watch?v=LXsnHyjy6sc" \
  "https://www.youtube.com/watch?v=JKh08TU58Y8"
```

---

## After downloads complete

When MP4s are in `$HOME/Downloads/yt/{huber,clouse,norton,sivers}/`, ping Claude with:

1. **Confirmation downloads completed** + file count per directory (sanity check)
2. **Workspace + user IDs** (from your existing CreatorCanon DB):
   - `workspaceId`: `e1ad6446-d463-4ee9-9451-7be5ac76f187` (matches existing seed-hormozi setup)
   - `userId`: `89c2bff3-797a-4922-81e3-a1a4696c7f53` (same)
3. **Channel rows** for each new creator — Claude will run SQL to create `manual_upload` channel rows with IDs like `ch_uploads_<workspaceId>_huber`, etc., one per creator.

Then Claude drives the cohort backfill in Task 8.13:
- Step 0: snapshot Phase 7 payloads to `/tmp/phase7-backup/` (rollback safety)
- Step 1a: Walker spike test on ONE canon body in `third_person_editorial` mode (validate prompt before full regen)
- Step 1b: regen Jordan / Walker / Hormozi audits
- Steps 2-5: onboard the 4 new creators via `seed-creator-batch` wrapper
- Steps 6-7: run all 5 validators × 7 creators + the cohort report
- Step 8: spot-check 7 audit URLs in browser
- Step 9: write Phase 8 results doc

Total pipeline time after downloads: ~3-4 hours (mostly Codex CLI calls).
