export const DAILY_HYDRATION_TARGET_L = 3.0;

/** Bump when John's official food seed/catalog changes. */
export const FOODS_SEED_VERSION = 'template_v4';

export const STORAGE_KEYS = {
  offlineQueue: 'ascensus_offline_queue',
  theme: 'ascensus_theme',
  themeChosen: 'ascensus_theme_chosen',
  lastActive: 'ascensus_last_active',
  metricTargets: 'ascensus_metric_targets',
  fixedSchedules: 'ascensus_fixed_schedules',
  journalMediaDb: 'ascensus_journal_media',
  foodsSeed: 'ascensus_foods_seed',
};

export const JOURNAL_MEDIA_DB = 'ascensus_journal_media';
export const JOURNAL_MEDIA_STORE = 'files';
export const JOURNAL_MEDIA_MAX = 4;
export const JOURNAL_MEDIA_MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
export const JOURNAL_MEDIA_MAX_VIDEO_BYTES = 40 * 1024 * 1024;
