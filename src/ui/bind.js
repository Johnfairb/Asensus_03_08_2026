import { toggleTheme } from './theme.js';
import { acceptGhostTemplate, addFoodToActiveLog, applyUserTemplate, deleteSavedTemplate, filterSavedLibrary, loadGhostTemplate, loadSavedTemplate, refreshTemplateSelector, removeFoodFromActiveLog, renderMyRecipes, renderMyWorkouts, saveCurrentAsTemplate, switchExercisesSubTab, switchFoodsSubTab, switchLogisticsSubTab, unconfirmGhostTemplate, updateActiveLogMass, updateGhostOverride } from './templates.js';
import { closeLoadRecipePicker, closeLoadWorkoutPicker, closeCalendarEventModal, closeLongTermCalendar, closeWorkoutTypePicker, openCalendarEventModal, openLoadRecipePicker, openLoadWorkoutPicker, openLongTermCalendar, openWorkoutTypePicker, renderLongTermCalendar, saveCalendarEvent, selectLoadedRecipe, selectLoadedWorkout, selectLoadedGpsSession, selectWorkoutType, beginManualWorkoutAfterType, switchLoadWorkoutTab } from './route.js';
import { openMyExercises, openMyFoods, switchDriveSubTab, switchEngineSubTab, switchFuelSubTab, switchJourneySubTab, switchLibrarySubTab, switchNetworkTab, switchPlanSubTab, switchTab } from './navigation.js';
import { closeGroceryDetail, executeCheckout, onShopCartToggle, openGroceryDetail, openShoppingCostBreakdown, updateShoppingSelection, wireShoppingSelectionUpdates } from './logistics.js';
import {
  closeDayDetail,
  deleteHistoryLog,
  editHistoryFoodMass,
  editLactateSessionFromCalendar,
  onJournalMediaSelected,
  openAdherenceExerciseLog,
  openAdherenceSessionDetail,
  backToAdherenceSession,
  openDayDetail,
  openHistoryWorkoutDetail,
  openLactateSessionDetail,
  removeJournalMedia,
  renderAdherenceCalendar,
  shiftAdherenceMonth,
  showGymSessionDiary,
  showLactateFullWorkout,
  showLactateSessionDiary,
  toggleJournalVoiceNote,
  toggleLactateFullWorkout
} from './journey.js';
import { showShopStyleInfo, toggleFoodHeading } from '../domain/food-catalog.js';
import { cancelExEdit, cancelFoodEdit, closeLibraryDetail, deleteItem, editExercise, editFood, editFromLibraryDetail, filterBoot, loadExercises, loadInventory, openExerciseDetail, openFoodDetail, openLibraryDontKnowWeight, saveExerciseIncrementsFromDetail, saveExerciseToCloud, saveExerciseWorkingWeightFromDetail, saveFoodToCloud, syncLibraryWeightDontKnowBtn, syncPackSizeFieldMode, toggleBanFromLibraryDetail, toggleExForm, togglePantryForm } from './fuel.js';
import { calculatePlates, closeBodyFatModal, closeExecutionZone, closeExerciseSetsModal, closeWeightModal, commitWorkoutSession, configureJournalModal, discardInProgressWorkout, dismissJournalModal, dismissSessionWrapModal, drawModalExerciseChart, redrawModalExerciseChart, editLoggedWorkoutSession, editOrphanWorkoutLogs, filterCardioTypeList, finalizeWorkoutLog, beginManualWorkoutSession, beginExerciseLog, manualAdd, openBodyFatModal, openExerciseSetsModal, openSpontaneousEventModal, openWeightModal, overrideRest, parkInProgressWorkout, playRestAlarm, populateCardioTypePicker, renderExerciseSets, renderWorkoutLog, resumeInProgressWorkout, selectCardioTypeInLog, setWorkoutLogFilter, showConstraintInfo, startExecution, startManualWorkout, startPendingFinderRest, startLactateBaselineStopwatch, stopInProgressWorkout, stopLactateBaselineStopwatch, submitBlindReroute, submitBodyFatLog, submitLactateBaselineResult, submitLog, submitSpontaneousEvent, submitWeightLog, swapExerciseInLog, switchCableEquipmentAndRefresh, switchLoadEquipmentAndRefresh, syncGlobalRestBanners, toggleConstraint, togglePrepChildExpand, togglePrepPartExpand, toggleStretchListExpand, toggleStretchGroupComplete, toggleStretchMuscleGroupComplete, startStretchTimer, toggleSessionStretchExclude, startHitTimer, logHitWorkNow, skipHitTimerRest, adjustHitTimerRest, setLactateBaselineInputKind, setLactateBaselineSpeedUnit, toggleExerciseDiary, togglePreviousExerciseDiary, updateCoreChildWeight, updateExerciseDiaryNotes, onExerciseDiaryMediaSelected, removeExerciseDiaryMedia, toggleSetComplete, toggleToolsMenu, updateWorkoutSet, workoutCardDragLeave, workoutCardDragOver, workoutCardDragStart, workoutCardDragEnd, workoutCardDrop, workoutReorderGapOver, workoutReorderGapLeave, workoutReorderGapDrop, workoutCardTouchEnd, workoutCardTouchStart, openManualGymRestModal, closeManualGymRestModal, toggleManualRestCustomFields, confirmManualGymRestPrefs } from './drive.js';
import { confirmEquipmentPicks } from './equipment-ui.js';
import { dismissPlannedWarmupFromLog, dismissPlannedStretchFromLog, hydrateStretchSettingsDom, saveSessionPrepSettings } from '../domain/session-prep.js';
import { closeLactateHitPicker, confirmLactateHitPicker, filterLactateHitOptions, openLactateHitPicker, toggleLactateHitType, selectLactateDesiredRpe, confirmLactateDesiredRpe, lactateWizardBackToTypes, lactateWizardBackToRpe, openLactateBaselineRedo, toggleLactateRedoType, confirmLactateRedoSelection, submitLactateBaselineStep, adjustLactateSessionRpe, openLactateBaselineRedoFromSession, redoLactateBaselineForType } from './lactate-ui.js';
import { onCoreStrengthSettingChange } from './core-strength-ui.js';
import { exportData, injectPitchData } from './demos.js';
import { drawExerciseChart, drawMacroChart, drawUnifiedChart, executeSundayForecast, filterExerciseChartList, onProgressRangeChange, selectExerciseForChart } from './charts.js';
import { completeOnboarding, nextObStep, selectAuthTheme, selectObCard, triggerBootSequence } from './auth-onboarding.js';
import { handleAuth, handleSignOut, quickLogin } from '../services/auth.js';
import { addDropSetToExercise, addDropSetToSupersetSide, addExerciseToActiveLog, addSetToExercise, addSupersetRound, addSupersetWithNext, removeGhostExercise, swapGhostExercise, unmergeSuperset } from '../domain/workout-generator.js';
import { openAddExercisesModal, closeAddExercisesModal, confirmAddExercisesModal } from './add-exercises-modal.js';
import { calculateAchievability, handleFocusChange, handleSportChange, onSexOrSportUiChange, onGymDaysOrPhaseUiChange, onHybridSplitChange, onSeasonPhaseChange, roundToEquipment, saveSettings, toggleRestStop } from '../domain/thermodynamics.js';
import { addFixedSchedule, closeFixedScheduleModal, closeSleepModal, closeVideoModal, commitMatchSession, commitPracticeSession, deleteFixedSchedule, deleteSportDiaryFromLog, editSportDiaryFromLog, generateFutureTimeline, getTeachingPoints, getVideoDirectives, openFixedScheduleModal, openFuturePlan, openMatchLogModal, openPracticeLogModal, openSleepModal, openVideoModal, selectTeachingPointVideo, submitSleepLog, syncSleepHoursWarning, switchDayPlanSubTab, toggleSchedTimeVisibility } from '../domain/route-planner.js';
import { openFlexibleRecipe } from '../domain/recipes.js';
import { clearSeasonDates, saveSeasonDates, submitRepairAssessment, triggerRepairModeCheck } from '../domain/periodization.js';
import { generateGroceryList, toggleGroceryAisle } from '../domain/grocery.js';
import { calculateLiveFitnessScores, closeMacroBreakdown, closeTrackerGuidanceModal, closeWorkoutDomainsDetail, generateDailyExerciseLog, openCoachesNotesModal, openTrackerGuidanceModal, openWorkoutDomainsDetail, saveTrackerGuidance, showBreakdown, updateLoggedSessionDuration, viewPreviousMatchEntry } from '../domain/fitness-hud.js';
import { updateLiveDashboard } from './journey.js';
import {
  addDiarySchemaField,
  removeDiarySchemaField,
  resetDiarySchemaFields,
  toggleDiarySchemaEditor,
  updateDiarySchemaField
} from './diary-ui.js';
import {
  confirmRpeAwarenessNo,
  confirmRpeAwarenessYes,
  dismissRpeAwareness,
  finishRpeGuideAndContinue,
  maybePromptRpeAwareness,
  openRpeGuidanceTab
} from './rpe-guidance-ui.js';
import {
  maybePromptWeightFinder,
  confirmWeightFinderKnowsYes,
  confirmWeightFinderKnowsNo,
  confirmBwGateYes,
  confirmBwGateNo,
  submitKnownWorkWeight,
  submitFinderWorkWeight,
  submitLibraryFinderWorkWeight,
  dismissWeightFinder
} from './weight-finder-ui.js';
import { renderRpeGuidancePanel, toggleRpeGuidanceSection, toggleGuidanceSection } from '../domain/rpe-guidance.js';
import { renderMonthlySummaryBanner, toggleMonthlySummaryDropdown } from '../domain/monthly-summary.js';
import { openMealDetail, closeMealDetail, generateDailyFoodLog, openLoggedMealDetail } from '../domain/meal-planner.js';
import { addNetworkFriendDemo, applyNetworkKillSwitch, filterNetworkFriends, networkCreateSquadDemo, networkInviteSquadDemo, renderSharePreview, saveNetworkProfile, shareActiveRouteCard, shareNetworkMeal, shareNetworkWorkout, toggleNetworkEnabled, toggleSquadDetail } from './network.js';
import { populateSportSelects } from '../domain/sports-matrix.js';

export function bindUi() {
  window.weightLoggedToday = false;
  window.bodyFatLoggedToday = false;
  window.completedStatusGlobal = { BRK: false, LUN: false, DIN: false, WRK: false };
  window.currentModalExIdx = null;
  window._journalPendingMedia = [];
  // Parked drafts survive reload — do not clear on boot
  window._workoutSessionConfirmed = false;
  window.acceptGhostTemplate = acceptGhostTemplate;
  window.unconfirmGhostTemplate = unconfirmGhostTemplate;
  window.addExerciseToActiveLog = addExerciseToActiveLog;
  window.swapGhostExercise = swapGhostExercise;
  window.removeGhostExercise = removeGhostExercise;
  window.openAddExercisesModal = openAddExercisesModal;
  window.closeAddExercisesModal = closeAddExercisesModal;
  window.confirmAddExercisesModal = confirmAddExercisesModal;
  window.addFixedSchedule = addFixedSchedule;
  window.addFoodToActiveLog = addFoodToActiveLog;
  window.addSetToExercise = addSetToExercise;
  window.addDropSetToExercise = addDropSetToExercise;
  window.addDropSetToSupersetSide = addDropSetToSupersetSide;
  window.addSupersetRound = addSupersetRound;
  window.addSupersetWithNext = addSupersetWithNext;
  window.unmergeSuperset = unmergeSuperset;
  window.workoutCardDragStart = workoutCardDragStart;
  window.workoutCardDragOver = workoutCardDragOver;
  window.workoutCardDragLeave = workoutCardDragLeave;
  window.workoutCardDragEnd = workoutCardDragEnd;
  window.workoutCardDrop = workoutCardDrop;
  window.workoutReorderGapOver = workoutReorderGapOver;
  window.workoutReorderGapLeave = workoutReorderGapLeave;
  window.workoutReorderGapDrop = workoutReorderGapDrop;
  window.workoutCardTouchStart = workoutCardTouchStart;
  window.workoutCardTouchEnd = workoutCardTouchEnd;
  window.onSeasonPhaseChange = onSeasonPhaseChange;
  window.onGymDaysOrPhaseUiChange = onGymDaysOrPhaseUiChange;
  window.onHybridSplitChange = onHybridSplitChange;
  window.applyUserTemplate = applyUserTemplate;
  window.refreshTemplateSelector = refreshTemplateSelector;
  window.calculateAchievability = calculateAchievability;
  window.calculatePlates = calculatePlates;
  window.cancelExEdit = cancelExEdit;
  window.cancelFoodEdit = cancelFoodEdit;
  window.clearSeasonDates = clearSeasonDates;
  window.closeDayDetail = closeDayDetail;
  window.closeBodyFatModal = closeBodyFatModal;
  window.closeExecutionZone = closeExecutionZone;
  window.closeWeightModal = closeWeightModal;
  window.closeFixedScheduleModal = closeFixedScheduleModal;
  window.closeLoadRecipePicker = closeLoadRecipePicker;
  window.closeLoadWorkoutPicker = closeLoadWorkoutPicker;
  window.closeWorkoutTypePicker = closeWorkoutTypePicker;
  window.closeLongTermCalendar = closeLongTermCalendar;
  window.closeCalendarEventModal = closeCalendarEventModal;
  window.closeMacroBreakdown = closeMacroBreakdown;
  window.closeLibraryDetail = closeLibraryDetail;
  window.closeMealDetail = closeMealDetail;
  window.editFromLibraryDetail = editFromLibraryDetail;
  window.toggleBanFromLibraryDetail = toggleBanFromLibraryDetail;
  window.openExerciseDetail = openExerciseDetail;
  window.openFoodDetail = openFoodDetail;
  window.saveExerciseWorkingWeightFromDetail = saveExerciseWorkingWeightFromDetail;
  window.syncLibraryWeightDontKnowBtn = syncLibraryWeightDontKnowBtn;
  window.openLibraryDontKnowWeight = openLibraryDontKnowWeight;
  window.openHistoryWorkoutDetail = openHistoryWorkoutDetail;
  window.openLoggedMealDetail = openLoggedMealDetail;
  window.openBodyFatModal = openBodyFatModal;
  window.openWeightModal = openWeightModal;
  window.closeSleepModal = closeSleepModal;
  window.closeTrackerGuidanceModal = closeTrackerGuidanceModal;
  window.closeVideoModal = closeVideoModal;
  window.closeWorkoutDomainsDetail = closeWorkoutDomainsDetail;
  window.commitMatchSession = commitMatchSession;
  window.commitPracticeSession = commitPracticeSession;
  window.commitWorkoutSession = commitWorkoutSession;
  window.completeOnboarding = completeOnboarding;
  window.configureJournalModal = configureJournalModal;
  window.currentModalExIdx = null;
  window.deleteFixedSchedule = deleteFixedSchedule;
  window.deleteHistoryLog = deleteHistoryLog;
  window.deleteItem = deleteItem;
  window.deleteSavedTemplate = deleteSavedTemplate;
  window.deleteSportDiaryFromLog = deleteSportDiaryFromLog;
  window.editSportDiaryFromLog = editSportDiaryFromLog;
  window.dismissJournalModal = dismissJournalModal;
  window.drawExerciseChart = drawExerciseChart;
  window.drawMacroChart = drawMacroChart;
  window.drawUnifiedChart = drawUnifiedChart;
  window.filterExerciseChartList = filterExerciseChartList;
  window.onProgressRangeChange = onProgressRangeChange;
  window.selectExerciseForChart = selectExerciseForChart;
  window.editExercise = editExercise;
  window.editFood = editFood;
  window.editHistoryFoodMass = editHistoryFoodMass;
  window.editLoggedWorkoutSession = editLoggedWorkoutSession;
  window.editOrphanWorkoutLogs = editOrphanWorkoutLogs;
  window.beginManualWorkoutSession = beginManualWorkoutSession;
  window.beginManualWorkoutAfterType = beginManualWorkoutAfterType;
  window.openManualGymRestModal = openManualGymRestModal;
  window.closeManualGymRestModal = closeManualGymRestModal;
  window.toggleManualRestCustomFields = toggleManualRestCustomFields;
  window.confirmManualGymRestPrefs = confirmManualGymRestPrefs;
  window.closeGroceryDetail = closeGroceryDetail;
  window.generateDailyFoodLog = generateDailyFoodLog;
  window.generateDailyExerciseLog = generateDailyExerciseLog;
  window.executeCheckout = executeCheckout;
  window.executeSundayForecast = executeSundayForecast;
  window.onSundayWeekEventTypeChange = (...args) => import('../domain/sunday-forecast.js').then(m => m.onSundayWeekEventTypeChange(...args));
  window.chooseWorkoutCycleOption = (...args) => import('./workout-cycle-ui.js').then(m => m.chooseWorkoutCycleOption(...args));
  window.confirmWorkoutCycleDecisions = () => import('./workout-cycle-ui.js').then(m => m.confirmWorkoutCycleDecisions());
  window.selectCycleCustomWorkout = (...args) => import('./workout-cycle-ui.js').then(m => m.selectCycleCustomWorkout(...args));
  window.exportData = exportData;
  window.filterBoot = filterBoot;
  window.filterNetworkFriends = filterNetworkFriends;
  window.filterSavedLibrary = filterSavedLibrary;
  window.finalizeWorkoutLog = finalizeWorkoutLog;
  window.generateFutureTimeline = generateFutureTimeline;
  window.generateGroceryList = generateGroceryList;
  window.toggleGroceryAisle = toggleGroceryAisle;
  window.getVideoDirectives = getVideoDirectives;
  window.getTeachingPoints = getTeachingPoints;
  window.selectTeachingPointVideo = selectTeachingPointVideo;
  window.handleAuth = handleAuth;
  window.handleFocusChange = handleFocusChange;
  window.handleSignOut = handleSignOut;
  window.handleSportChange = handleSportChange;
  window.onSexOrSportUiChange = onSexOrSportUiChange;
  window.injectPitchData = injectPitchData;
  window.loadExercises = loadExercises;
  window.loadGhostTemplate = loadGhostTemplate;
  window.loadInventory = loadInventory;
  window.loadSavedTemplate = loadSavedTemplate;
  window.renderMyRecipes = renderMyRecipes;
  window.renderMyWorkouts = renderMyWorkouts;
  window.manualAdd = manualAdd;
  window.nextObStep = nextObStep;
  window.onJournalMediaSelected = onJournalMediaSelected;
  window.openCalendarEventModal = openCalendarEventModal;
  window.openCoachesNotesModal = openCoachesNotesModal;
  window.openDayDetail = openDayDetail;
  window.openAdherenceSessionDetail = openAdherenceSessionDetail;
  window.openAdherenceExerciseLog = openAdherenceExerciseLog;
  window.backToAdherenceSession = backToAdherenceSession;
  window.openLactateSessionDetail = openLactateSessionDetail;
  window.showLactateFullWorkout = showLactateFullWorkout;
  window.toggleLactateFullWorkout = toggleLactateFullWorkout;
  window.showLactateSessionDiary = showLactateSessionDiary;
  window.showGymSessionDiary = showGymSessionDiary;
  window.editLactateSessionFromCalendar = editLactateSessionFromCalendar;
  window.openGroceryDetail = openGroceryDetail;
  window.openShoppingCostBreakdown = openShoppingCostBreakdown;
  window.openFixedScheduleModal = openFixedScheduleModal;
  window.openFlexibleRecipe = openFlexibleRecipe;
  window.openFuturePlan = openFuturePlan;
  window.openLoadRecipePicker = openLoadRecipePicker;
  window.openLoadWorkoutPicker = openLoadWorkoutPicker;
  window.openWorkoutTypePicker = openWorkoutTypePicker;
  window.selectWorkoutType = selectWorkoutType;
  window.openLongTermCalendar = openLongTermCalendar;
  window.renderLongTermCalendar = renderLongTermCalendar;
  window.openMatchLogModal = openMatchLogModal;
  window.openMealDetail = openMealDetail;
  window.openMyExercises = openMyExercises;
  window.openMyFoods = openMyFoods;
  window.openPracticeLogModal = openPracticeLogModal;
  window.openSleepModal = openSleepModal;
  window.syncSleepHoursWarning = syncSleepHoursWarning;
  window.openTrackerGuidanceModal = openTrackerGuidanceModal;
  window.openVideoModal = openVideoModal;
  window.openWorkoutDomainsDetail = openWorkoutDomainsDetail;
  window.overrideRest = overrideRest;
  window.playRestAlarm = playRestAlarm;
  window.quickLogin = quickLogin;
  window.removeFoodFromActiveLog = removeFoodFromActiveLog;
  window.removeJournalMedia = removeJournalMedia;
  window.renderAdherenceCalendar = renderAdherenceCalendar;
  window.roundToEquipment = roundToEquipment;
  window.roundEquipment = roundToEquipment;
  window.openExerciseSetsModal = openExerciseSetsModal;
  window.beginExerciseLog = beginExerciseLog;
  window.switchCableEquipmentAndRefresh = switchCableEquipmentAndRefresh;
  window.switchLoadEquipmentAndRefresh = switchLoadEquipmentAndRefresh;
  window.startPendingFinderRest = startPendingFinderRest;
  window.startLactateBaselineStopwatch = startLactateBaselineStopwatch;
  window.stopLactateBaselineStopwatch = stopLactateBaselineStopwatch;
  window.submitLactateBaselineResult = submitLactateBaselineResult;
  window.dismissSessionWrapModal = dismissSessionWrapModal;
  window.confirmEquipmentPicks = confirmEquipmentPicks;
  window.saveExerciseIncrementsFromDetail = saveExerciseIncrementsFromDetail;
  window.setWorkoutLogFilter = setWorkoutLogFilter;
  window.closeExerciseSetsModal = closeExerciseSetsModal;
  window.renderExerciseSets = renderExerciseSets;
  window.renderWorkoutLog = renderWorkoutLog;
  window.syncGlobalRestBanners = syncGlobalRestBanners;
  window.saveCalendarEvent = saveCalendarEvent;
  window.saveCurrentAsTemplate = saveCurrentAsTemplate;
  window.saveExerciseToCloud = saveExerciseToCloud;
  window.saveFoodToCloud = saveFoodToCloud;
  window.saveSeasonDates = saveSeasonDates;
  window.saveSettings = saveSettings;
  window.saveTrackerGuidance = saveTrackerGuidance;
  window.selectAuthTheme = selectAuthTheme;
  window.selectLoadedRecipe = selectLoadedRecipe;
  window.selectLoadedWorkout = selectLoadedWorkout;
  window.selectLoadedGpsSession = selectLoadedGpsSession;
  window.switchLoadWorkoutTab = switchLoadWorkoutTab;
  window.selectObCard = selectObCard;
  window.shiftAdherenceMonth = shiftAdherenceMonth;
  window.showBreakdown = showBreakdown;
  window.showConstraintInfo = showConstraintInfo;
  window.showShopStyleInfo = showShopStyleInfo;
  window.syncPackSizeFieldMode = syncPackSizeFieldMode;
  window.toggleFoodHeading = toggleFoodHeading;
  window.startExecution = startExecution;
  window.startManualWorkout = startManualWorkout;
  window.resumeInProgressWorkout = resumeInProgressWorkout;
  window.parkInProgressWorkout = parkInProgressWorkout;
  window.stopInProgressWorkout = stopInProgressWorkout;
  window.discardInProgressWorkout = discardInProgressWorkout;
  window.openLactateHitPicker = openLactateHitPicker;
  window.closeLactateHitPicker = closeLactateHitPicker;
  window.confirmLactateHitPicker = confirmLactateHitPicker;
  window.filterLactateHitOptions = filterLactateHitOptions;
  window.toggleLactateHitType = toggleLactateHitType;
  window.selectLactateDesiredRpe = selectLactateDesiredRpe;
  window.confirmLactateDesiredRpe = confirmLactateDesiredRpe;
  window.lactateWizardBackToTypes = lactateWizardBackToTypes;
  window.lactateWizardBackToRpe = lactateWizardBackToRpe;
  window.openLactateBaselineRedo = openLactateBaselineRedo;
  window.redoLactateBaselineForType = redoLactateBaselineForType;
  window.toggleLactateRedoType = toggleLactateRedoType;
  window.confirmLactateRedoSelection = confirmLactateRedoSelection;
  window.submitLactateBaselineStep = submitLactateBaselineStep;
  window.adjustLactateSessionRpe = adjustLactateSessionRpe;
  window.openLactateBaselineRedoFromSession = openLactateBaselineRedoFromSession;
  window.toggleJournalVoiceNote = toggleJournalVoiceNote;
  window.submitBlindReroute = submitBlindReroute;
  window.submitLog = submitLog;
  window.submitRepairAssessment = submitRepairAssessment;
  window.submitSleepLog = submitSleepLog;
  window.submitWeightLog = submitWeightLog;
  window.submitBodyFatLog = submitBodyFatLog;
  window.submitSpontaneousEvent = submitSpontaneousEvent;
  window.openSpontaneousEventModal = openSpontaneousEventModal;
  window.viewPreviousMatchEntry = viewPreviousMatchEntry;
  window.updateLoggedSessionDuration = updateLoggedSessionDuration;
  window.updateLiveDashboard = updateLiveDashboard;
  window.toggleDiarySchemaEditor = toggleDiarySchemaEditor;
  window.addDiarySchemaField = addDiarySchemaField;
  window.removeDiarySchemaField = removeDiarySchemaField;
  window.updateDiarySchemaField = updateDiarySchemaField;
  window.resetDiarySchemaFields = resetDiarySchemaFields;
  window.renderRpeGuidancePanel = renderRpeGuidancePanel;
  window.toggleRpeGuidanceSection = toggleRpeGuidanceSection;
  window.toggleGuidanceSection = toggleGuidanceSection;
  window.openRpeGuidanceTab = openRpeGuidanceTab;
  window.maybePromptRpeAwareness = maybePromptRpeAwareness;
  window.confirmRpeAwarenessYes = confirmRpeAwarenessYes;
  window.confirmRpeAwarenessNo = confirmRpeAwarenessNo;
  window.dismissRpeAwareness = dismissRpeAwareness;
  window.finishRpeGuideAndContinue = finishRpeGuideAndContinue;
  window.redrawModalExerciseChart = redrawModalExerciseChart;
  window.dismissPlannedWarmupFromLog = dismissPlannedWarmupFromLog;
  window.dismissPlannedStretchFromLog = dismissPlannedStretchFromLog;
  window.saveSessionPrepSettings = saveSessionPrepSettings;
  window.hydrateStretchSettingsDom = hydrateStretchSettingsDom;
  window.maybePromptWeightFinder = maybePromptWeightFinder;
  window.confirmWeightFinderKnowsYes = confirmWeightFinderKnowsYes;
  window.confirmWeightFinderKnowsNo = confirmWeightFinderKnowsNo;
  window.confirmBwGateYes = confirmBwGateYes;
  window.confirmBwGateNo = confirmBwGateNo;
  window.submitKnownWorkWeight = submitKnownWorkWeight;
  window.submitFinderWorkWeight = submitFinderWorkWeight;
  window.submitLibraryFinderWorkWeight = submitLibraryFinderWorkWeight;
  window.dismissWeightFinder = dismissWeightFinder;
  window.renderMonthlySummaryBanner = renderMonthlySummaryBanner;
  window.toggleMonthlySummaryDropdown = toggleMonthlySummaryDropdown;
  window.filterCardioTypeList = filterCardioTypeList;
  window.populateCardioTypePicker = populateCardioTypePicker;
  window.selectCardioTypeInLog = selectCardioTypeInLog;
  window.swapExerciseInLog = swapExerciseInLog;
  window.switchDriveSubTab = switchDriveSubTab;
  window.switchExercisesSubTab = switchExercisesSubTab;
  window.switchFoodsSubTab = switchFoodsSubTab;
  window.switchFuelSubTab = switchFuelSubTab;
  window.switchLibrarySubTab = switchLibrarySubTab;
  window.switchLogisticsSubTab = switchLogisticsSubTab;
  window.switchDayPlanSubTab = switchDayPlanSubTab;
  window.switchNetworkTab = switchNetworkTab;
  window.switchJourneySubTab = switchJourneySubTab;
  window.switchEngineSubTab = switchEngineSubTab;
  window.switchPlanSubTab = switchPlanSubTab;
  window.switchTab = switchTab;
  window.toggleConstraint = toggleConstraint;
  window.toggleExForm = toggleExForm;
  window.togglePantryForm = togglePantryForm;
  window.toggleRestStop = toggleRestStop;
  window.toggleSchedTimeVisibility = toggleSchedTimeVisibility;
  window.togglePrepPartExpand = togglePrepPartExpand;
  window.togglePrepChildExpand = togglePrepChildExpand;
  window.updateCoreChildWeight = updateCoreChildWeight;
  window.onCoreStrengthSettingChange = onCoreStrengthSettingChange;
  window.toggleStretchListExpand = toggleStretchListExpand;
  window.toggleStretchGroupComplete = toggleStretchGroupComplete;
  window.toggleStretchMuscleGroupComplete = toggleStretchMuscleGroupComplete;
  window.startStretchTimer = startStretchTimer;
  window.toggleSessionStretchExclude = toggleSessionStretchExclude;
  window.startHitTimer = startHitTimer;
  window.logHitWorkNow = logHitWorkNow;
  window.skipHitTimerRest = skipHitTimerRest;
  window.adjustHitTimerRest = adjustHitTimerRest;
  window.setLactateBaselineInputKind = setLactateBaselineInputKind;
  window.setLactateBaselineSpeedUnit = setLactateBaselineSpeedUnit;
  window.toggleExerciseDiary = toggleExerciseDiary;
  window.togglePreviousExerciseDiary = togglePreviousExerciseDiary;
  window.updateExerciseDiaryNotes = updateExerciseDiaryNotes;
  window.onExerciseDiaryMediaSelected = onExerciseDiaryMediaSelected;
  window.removeExerciseDiaryMedia = removeExerciseDiaryMedia;
  window.toggleSetComplete = toggleSetComplete;
  window.toggleTheme = toggleTheme;
  window.toggleToolsMenu = toggleToolsMenu;
  window.triggerBootSequence = triggerBootSequence;
  window.triggerRepairModeCheck = triggerRepairModeCheck;
  window.updateActiveLogMass = updateActiveLogMass;
  window.updateShoppingSelection = updateShoppingSelection;
  window.onShopCartToggle = onShopCartToggle;
  window.wireShoppingSelectionUpdates = wireShoppingSelectionUpdates;
  wireShoppingSelectionUpdates();
  window.updateDomainBars = calculateLiveFitnessScores;
  window.updateGhostOverride = updateGhostOverride;
  window.updateWorkoutSet = updateWorkoutSet;

  window.toggleNetworkEnabled = toggleNetworkEnabled;
  window.saveNetworkProfile = saveNetworkProfile;
  window.addNetworkFriendDemo = addNetworkFriendDemo;
  window.toggleSquadDetail = toggleSquadDetail;
  window.networkCreateSquadDemo = networkCreateSquadDemo;
  window.networkInviteSquadDemo = networkInviteSquadDemo;
  window.shareNetworkWorkout = shareNetworkWorkout;
  window.shareNetworkMeal = shareNetworkMeal;
  window.renderSharePreview = renderSharePreview;
  window.shareActiveRoute = shareActiveRouteCard;
  applyNetworkKillSwitch();

  try { populateSportSelects(); } catch (e) { /* ignore */ }

  window._journalPendingMedia = [];
}
