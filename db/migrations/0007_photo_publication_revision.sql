CREATE UNIQUE INDEX "media_published_photo_selections_draft_revision_uidx" ON "media_published_photo_selections" USING btree ("owner_user_id","draft_revision");
