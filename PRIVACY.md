# Privacy

Kita has no account, cloud database, analytics, or runtime AI service. User records are stored in IndexedDB on this device. Camera and microphone data are processed locally by the browser and workers; Kita does not upload or save raw recordings. Face and optional voice embeddings are stored locally when the user enrolls people. Get their consent first.

Model files are downloaded to this device during setup from the app's configured model source and cached for offline use. This setup download requires internet access. Normal inference uses the local model files and does not need a model API.

The app asks for camera, microphone, location, and motion/orientation access only when a related feature is used. Location is used for saved places and direction. Permission choices are controlled by the browser and can be revoked in its settings.

Use Settings → Delete all data to clear Kita's local records and caches. Encrypted backups are written to a file the user chooses where to store. They are not uploaded by Kita. The backup passphrase cannot be recovered; keep it separate from the backup file.
