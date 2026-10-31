# Post image uploads

Use **Add images** in Create post or Edit post. Up to four JPEG, PNG, or WebP still images may accompany a post. Each upload can be up to 4 MB and 40 megapixels. A title and image are enough; body text is optional when images are attached.

Images are decoded, oriented, resized to fit 2560 × 2560, and re-encoded as WebP without original metadata. Stored output is limited to 2 MB per image. Captions in the editor provide accessible image descriptions. External Markdown images remain disabled.

The existing database stores the images: PostgreSQL `BYTEA` in production, SQLite `BLOB` locally. No object storage service or filesystem persistence is needed. Feed/search payloads include image metadata only; `/api/images/[id]` serves image bytes separately.

Unpublished uploads are visible only to their uploader and expire after 14 days. Browser drafts retain their image references. Expired unattached images are cleaned up during subsequent uploads. Each account can have 20 pending images and make 20 upload attempts per hour. Discarding a draft or removing an unpublished attachment requests deletion; abandoned uploads expire automatically.

Publishing and editing enforce image ownership, attachment count and post revision in the same transaction. Published images cannot be reused on another post. Image responses are not cached, so removed posts and deleted attachments stop serving images immediately. Restoring a moderated post restores its image access. Suspended accounts cannot upload or change attachments.

Apply `npm run db:migrate` before deploying. `post_images` is additive and has no seed data. Image upload validation and publication are covered by browser/API checks and the PostgreSQL integration script.
