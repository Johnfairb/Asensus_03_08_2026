import { toggleTheme } from './theme.js';
import { acceptGhostTemplate, addFoodToActiveLog, applyUserTemplate, deleteSavedTemplate, filterSavedLibrary, loadGhostTemplate, loadSavedTemplate, refreshTemplateSelector, removeFoodFromActiveLog, renderMyRecipes, renderMyWorkouts, saveCurrentAsTemplate, switchExercisesSubTab, switchFoodsSubTab, switchLogisticsSubTab, unconfirmGhostTemplate, updateActiveLogMass, updateGhostOverride } from './templates.js';
import { closeLoadRecipePicker, closeLoadWorkoutPicker, closeCalendarEventModal, closeLongTermCalendar, closeWorkoutTypePicker, openCalendarEventModal, openLoadRecipePicker, openLoadWorkoutPicker, openLongTermCalendar, openWorkoutTypePicker, renderLongTermCalendar, saveCalendarEvent, selectLoadedRecipe, selectLoadedWorkout, selectWorkoutType, beginManualWorkoutAfterType } from './route.js';
import { openMyExercises, openMyFoods, switchDriveSubTab, switchEngineSubTab, switchFuelSubTab, switchJourneySubTab, switchLibrarySubTab, switchNetworkTab, switchPlanSubTab, switchTab } from './navigation.js';
import { closeGroceryDetail, executeCheckout, onShopCartToggle, openGroceryDetail, openShoppingCostBreakdown, updateShoppingSelection, wireShoppingSelectionUpdates } from './logistics.js';
import {
  closeDayDetail,
  deleteHistoryLog,
  editHistoryFoodMass,
  editLactateSessionFromCalendar,
  onJournalMediaSelected,
  openAdherenceSessionDetail,
  openDayDetail,
  openHistoryWorkoutDetail,
  openLactateSessionDetail,
  removeJournalMedia,
  renderAdherenceCalendar,
  shiftAdherenceMonth,
  showLactateFullWorkout,
  showLactateSessionDiary,
  toggleJournalVoiceNote,
  toggleLactateFullWorkout
} from './journey.js';
import { showShopStyleInfo, toggleFoodHeading } from '../domain/food-catalog.js';
import { cancelExEdit, cancelFoodEdit, closeLibraryDetail, deleteItem, editExercise, editFood, editFromLibraryDetail, filterBoot, loadExercises, loadInventory, openExerciseDetail, openFoodDetail, saveExerciseToCloud, saveFoodToCloud, syncPackSizeFieldMode, toggleBanFromLibraryDetail, toggleExForm, togglePantryForm } from './fuel.js';
import { calculatePlates, closeBodyFatModal, closeExecutionZone, closeExerciseSetsModal, closeWeightModal, commitWorkoutSession, configureJournalModal, discardInProgressWorkout, dismissJournalModal, editLoggedWorkoutSession, editOrphanWorkoutLogs, filterCardioTypeList, finalizeWorkoutLog, beginManualWorkoutSession, beginExerciseLog, manualAdd, openBodyFatModal, openExerciseSetsModal, openSpontaneousEventModal, openWeightModal, overrideRest, parkInProgressWorkout, playRestAlarm, populateCardioTypePicker, renderExerciseSets, resumeInProgressWorkout, selectCardioTypeInLog, setWorkoutLogFilter, showConstraintInfo, startExecution, startManualWorkout, stopInProgressWorkout, submitBlindReroute, submitBodyFatLog, submitLog, submitSpontaneousEvent, submitWeightLog, swapExerciseInLog, toggleConstraint, toggleSetComplete, toggleToolsMenu, updateWorkoutSet } from './drive.js';
import { closeLactateHitPicker, confirmLactateHitPicker, filterLactateHitOptions, openLactateHitPicker, toggleLactateHitType, selectLactateDesiredRpe, confirmLactateDesiredRpe, lactateWizardBackToTypes, lactateWizardBackToRpe, openLactateBaselineRedo, toggleLactateRedoType, confirmLactateRedoSelection, submitLactateBaselineStep, adjustLactateSessionRpe, openLactateBaselineRedoFromSession, redoLactateBaselineForType } from './lactate-ui.js';
import { exportData, injectPitchData } from './demos.js';
import { drawExerciseChart, drawMacroChart, drawUnifiedChart, executeSundayForecast, filterExerciseChartList, onProgressRangeChange, selectExerciseForChart } from './charts.js';
import { completeOnboarding, nextObStep, selectAuthTheme, selectObCard, triggerBootSequence } from './auth-onboarding.js';
import { handleAuth, handleSignOut, quickLogin } from '../services/auth.js';
import { addDropSetToExercise, addExerciseToActiveLog, addSetToExercise, addSupersetWithNext } from '../domain/workout-generator.js';
import { calculateAchievability, handleFocusChange, handleSportChange, onGymDaysOrPhaseUiChange, onSeasonPhaseChange, roundToEquipment, saveSettings, toggleRestStop } from '../domain/thermodynamics.js';
import { addFixedSchedule, closeFixedScheduleModal, closeSleepModal, closeVideoModal, commitMatchSession, commitPracticeSession, deleteFixedSchedule, deleteSportDiaryFromLog, editSportDiaryFromLog, generateFutureTimeline, getVideoDirectives, openFixedScheduleModal, openFuturePlan, openMatchLogModal, openPracticeLogModal, openSleepModal, openVideoModal, submitSleepLog, switchDayPlanSubTab, toggleSchedTimeVisibility } from '../domain/route-planner.js';
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
  dismissWeightFinder
} from './weight-finder-ui.js';
import { renderRpeGuidancePanel, toggleRpeGuidanceSection, toggleGuidanceSection } from '../domain/rpe-guidance.js';
import { renderMonthlySummaryBanner, toggleMonthlySummaryDropdown } from '../domain/monthly-summary.js';
import { openMealDetail, closeMealDetail, generateDailyFoodLog, openLoggedMealDetail } from '../domain/meal-planner.js';
import { addNetworkFriendDemo, applyNetworkKillSwitch, filterNetworkFriends, networkCreateSquadDemo, networkInviteSquadDemo, renderSharePreview, saveNetworkProfile, shareActiveRouteCard, shareNetworkMeal, shareNetworkWorkout, toggleNetworkEnabled, toggleSquadDetail } from './network.js';

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
  window.addFixedSchedule = addFixedSchedule;
  window.addFoodToActiveLog = addFoodToActiveLog;
  window.addSetToExercise = addSetToExercise;
  window.addDropSetToExercise = addDropSetToExercise;
  window.addSupersetWithNext = addSupersetWithNext;
  window.onSeasonPhaseChange = onSeasonPhaseChange;
  window.onGymDaysOrPhaseUiChange = onGymDaysOrPhaseUiChange;
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
  window.closeGroceryDetail = closeGroceryDetail;
  window.generateDailyFoodLog = generateDailyFoodLog;
  window.generateDailyExerciseLog = generateDailyExerciseLog;
  window.executeCheckout = executeCheckout;
  window.executeSundayForecast = executeSundayForecast;
  window.exportData = exportData;
  window.filterBoot = filterBoot;
  window.filterNetworkFriends = filterNetworkFriends;
  window.filterSavedLibrary = filterSavedLibrary;
  window.finalizeWorkoutLog = finalizeWorkoutLog;
  window.generateFutureTimeline = generateFutureTimeline;
  window.generateGroceryList = generateGroceryList;
  window.toggleGroceryAisle = toggleGroceryAisle;
  window.getVideoDirectives = getVideoDirectives;
  window.handleAuth = handleAuth;
  window.handleFocusChange = handleFocusChange;
  window.handleSignOut = handleSignOut;
  window.handleSportChange = handleSportChange;
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
  window.openLactateSessionDetail = openLactateSessionDetail;
  window.showLactateFullWorkout = showLactateFullWorkout;
  window.toggleLactateFullWorkout = toggleLactateFullWorkout;
  window.showLactateSessionDiary = showLactateSessionDiary;
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
  window.setWorkoutLogFilter = setWorkoutLogFilter;
  window.closeExerciseSetsModal = closeExerciseSetsModal;
  window.renderExerciseSets = renderExerciseSets;
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
  window.maybePromptWeightFinder = maybePromptWeightFinder;
  window.confirmWeightFinderKnowsYes = confirmWeightFinderKnowsYes;
  window.confirmWeightFinderKnowsNo = confirmWeightFinderKnowsNo;
  window.confirmBwGateYes = confirmBwGateYes;
  window.confirmBwGateNo = confirmBwGateNo;
  window.submitKnownWorkWeight = submitKnownWorkWeight;
  window.submitFinderWorkWeight = submitFinderWorkWeight;
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

  window._journalPendingMedia = [];
}
