/** Journal media IndexedDB helpers live in ui/journey.js; re-export for plan path. */
export {
  openJournalMediaDB,
  idbPutJournalMedia,
  idbGetJournalMedia,
  resetJournalMedia,
  renderJournalMediaPreview,
  removeJournalMedia,
  onJournalMediaSelected,
  persistPendingJournalMedia,
  buildJournalMediaGalleryHtml,
} from '../ui/journey.js';
