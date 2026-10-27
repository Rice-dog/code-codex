import { applyPluginCardIcons } from '../components/plugin-icons';
import {attachPluginPins} from '../components/plugin-pins';
import {AsciiTilesSettingsController,asciiTilesCardMarkup,asciiTilesPanelMarkup} from '../features/plugin-settings/ascii-tiles';
import {getAsciiTilesBackgroundController} from '../plugin-host/backgrounds/ascii-tiles';
import {ASCII_TILES_BACKGROUND_PLUGIN_ID} from '../effects/ascii-tiles/model';
import type { WorkspaceBridge } from "../contracts/bridge";
import { BackgroundActions } from "../core/appearance/background-actions";
import { AppearanceCoordinator } from '../core/lifecycle/appearance-coordinator';
import { PanelCoordinator } from "../core/lifecycle/panel-coordinator";
import { WorkspaceSession } from '../core/session/workspace-session';
import { MutationGate } from "../features/file-operations/mutation-gate";
import { AuroraIonosphereSettingsController } from "../features/plugin-settings/aurora-ionosphere";
import { BlackHoleSettingsController } from "../features/plugin-settings/black-hole";
import { BlinkingSquaresSettingsController } from "../features/plugin-settings/blinking-squares";
import { CloudTrainSettingsController } from "../features/plugin-settings/cloud-train";
import { GitHistorySettingsController } from "../features/plugin-settings/git-history";
import { GlowHorizonSettingsController } from "../features/plugin-settings/glow-horizon";
import { HeavenlyCloudSettingsController } from "../features/plugin-settings/heavenly-cloud";
import { MilkyWaySettingsController } from "../features/plugin-settings/milky-way";
import { MountainSettingsController } from "../features/plugin-settings/mountain";
import { ParticleSettingsController } from "../features/plugin-settings/particle";
import { PixelSculptSettingsController } from "../features/plugin-settings/pixel-sculpt";
import { StartupSettingsController } from "../features/plugin-settings/startup";
import { DirectoryJobsController } from "../features/workspace/directory-jobs";
import { ExternalDropController } from "../features/workspace/external-drop";
import { FileActionsController } from "../features/workspace/file-actions";
import { PreviewEditingController } from "../features/workspace/preview-editing";
import { PreviewRequestsController } from "../features/workspace/preview-requests";
import { PreviewWorkspaceController } from "../features/workspace/preview-workspace";
import { TreeInteractionController } from "../features/workspace/tree-interaction";
import { UpdatesController } from "../features/workspace/updates";
import { NativeWindowBackground } from "../host/native-surfaces/native-window-background";
import { requireConstructor } from '../plugin-host/api1';
// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { type CustomBackground } from "../../plugins/appearance/custom-background/controller";
import { ActiveThreadTracker } from "../active-thread";
import { MAIN_SURFACE_SELECTOR,activePageElements } from "../adapters/codex-26.715";
import { BackgroundPackageMarket } from "../background-package-market";
import { backgroundModule,connectBackgroundPackages } from "../background-plugin-runtime";
import { BridgeUnavailableError,ExplorerBridge,ExplorerBridgeError,assessBootstrapCompatibility,getBootstrapConfig } from "../bridge";
import { backgroundSettingsText,bilingualLabelMarkup } from "../components/parameter-format";
import { auroraIonosphereBackgroundCardMarkup,auroraIonosphereSettingsPanelMarkup,blackHoleBackgroundCardMarkup,blackHoleSettingsPanelMarkup,blinkingSquaresCardMarkup,blinkingSquaresPanelMarkup,cloudTrainCardMarkup,cloudTrainPanelMarkup,formatAuroraIonosphereControlValue,formatBlackHoleControlValue,formatGlowHorizonControlValue,formatHeavenlyCloudControlValue,formatMilkyWayControlValue,gitHistoryCardMarkup,gitHistoryPanelMarkup,glowHorizonBackgroundCardMarkup,glowHorizonSettingsPanelMarkup,heavenlyCloudBackgroundCardMarkup,heavenlyCloudSettingsPanelMarkup,mediaPreviewRoute,milkyWayBackgroundCardMarkup,milkyWaySettingsPanelMarkup,mountainCardMarkup,mountainPanelMarkup,particleBackgroundCardMarkup,particleSettingsPanelMarkup,pixelSculptCardMarkup,pixelSculptPanelMarkup,previewerCardMarkup,startupTransitionCardMarkup,startupTransitionPanelMarkup,transparentBackgroundCardMarkup } from "../components/plugin-templates";
import { type BootstrapConfig,type ChangeKind,type ExplorerChange,type ExplorerSettings,type ExplorerViewState } from "../contracts/bridge";
import { type BackgroundSettingsLanguage,type BlackHoleColorSettingKey,type BlackHoleNumericControlDefinition,type BlackHoleNumericSettingKey,type BlackHolePresetName,type GlowHorizonNumericControlDefinition,type GlowHorizonNumericSettingKey,type HeavenlyCloudNumericControlDefinition,type HeavenlyCloudNumericSettingKey,type ParticleImageTransformControlDefinition,type ParticleImageTransformKey,type ParticleNumericControlDefinition,type ParticleNumericSettingKey,type PreviewMarketCategory,type PreviewTab,type PreviewerDefinition,type StateCopy } from "../contracts/explorer-model";
import { asRecord,errorCode,isTransientBootstrapError,normalizeChange,normalizeContext,normalizeHeaderLabel,normalizeList,normalizeSettings } from "../core/bridge/response-validation";
import { ACTION_NOTICE_DURATION_MS,APPEARANCE_PLUGIN_IDS,APPEARANCE_PLUGIN_SETTINGS_KEY,AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS,BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PRESETS,BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS,BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,BOOTSTRAP_RETRY_DELAY_MS,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,DEFAULT_SETTINGS,FORCED_COLORS_QUERY,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS,MAX_WIDTH,MILKY_WAY_BACKGROUND_PLUGIN_ID,MIN_WIDTH,MOUNTAIN_BACKGROUND_PLUGIN_ID,PAGE_SIZE,PARTICLE_BACKGROUND_PLUGIN_ID,PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS,PARTICLE_NUMERIC_CONTROL_DEFINITIONS,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID,PREVIEWER_DEFINITIONS,PREVIEWER_IDS,PREVIEWER_SETTINGS_KEY,REDUCED_TRANSPARENCY_QUERY,SETTINGS_KEY,TRANSPARENT_BACKGROUND_ATTRIBUTE,TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS,TRANSPARENT_BACKGROUND_PLUGIN_ID } from "../core/configuration/explorer";
import { MAIN_PREVIEW_TAG } from "../core/preview/configuration";
import { readParticleThemeLease,transferParticleThemeLease } from "../host/appearance/theme-lease";
import { WindowTransparencyResult,transparencyActionError,validateTransparencyResult } from "../host/native-surfaces/window-result";
import { localizeOwnedUi,parameterLanguage,subscribeLanguage } from "../i18n";
import { icons } from "../icons";
import { cloneParticleMorphCurve,normalizeParticleSettings } from "../particle-image-startup";
import { getAuroraIonosphereBackgroundController } from "../plugin-host/backgrounds/aurora-ionosphere";
import { getBlackHoleBackgroundController } from "../plugin-host/backgrounds/black-hole";
import { getBlinkingSquaresBackgroundController } from "../plugin-host/backgrounds/blinking-squares";
import { getCloudTrainBackgroundController } from "../plugin-host/backgrounds/cloud-train";
import { getGlowHorizonBackgroundController } from "../plugin-host/backgrounds/glow-horizon";
import { getHeavenlyCloudBackgroundController } from "../plugin-host/backgrounds/heavenly-cloud";
import { getMilkyWayBackgroundController } from "../plugin-host/backgrounds/milky-way";
import { getMountainBackgroundController } from "../plugin-host/backgrounds/mountain";
import { getParticleBackgroundController } from "../plugin-host/backgrounds/particle";
import { getPixelSculptBackgroundController } from "../plugin-host/backgrounds/pixel-sculpt";
import { ensureBackgroundPackage } from "../plugin-load-diagnostics";
import { isPluginPackageLoaded } from "../plugin-runtime";
import { runtimeEvent,runtimeTaskLabel } from "../runtime-events";
import { observePluginControls } from "../runtime-information";
import { beginRuntimeOperation,recordCaughtRuntimeError,runtimeErrorDetails } from "../runtime-operations";
import { dismissExplorerForSession,isExplorerDismissedForSession } from "../session-state";
import { AuroraIonosphereNumericControlDefinition,AuroraIonosphereNumericSettingKey,MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS,MilkyWayNumericControlDefinition,MilkyWayNumericSettingKey,normalizeAuroraIonosphereSettings,normalizeBlackHoleSettings,normalizeGlowHorizonSettings,normalizeHeavenlyCloudSettings,normalizeMilkyWaySettings } from "../startup-background-renderers";
import { readStartupTransitionSettings } from "../startup-transition-plugin";
import { styles } from "../styles";
import { SURFACE_OPACITY_TREE_CSS,SurfaceOpacityPlugin,surfaceOpacityCardMarkup,surfaceOpacityPanelMarkup } from "../surface-opacity";
import { parentPath } from "../tree-model";
import { applyTransparentPresentation,clearTransparentPresentation,transparentPresentation } from "../utility-plugin-facade";
import { VersionFeedback } from "../version-feedback";
import { CodeCodexMainPreviewElement,registerMainPreviewElement } from "./main-preview-element";
export class CodeCodexElement extends HTMLElement {
    #nativeWindowBackgroundValue:NativeWindowBackground|undefined;
    get #nativeWindowBackground():NativeWindowBackground {
      return this.#nativeWindowBackgroundValue??=new NativeWindowBackground({
        blocked:()=>this.#transparencyPreferenceBlocked(),
        request:async enabled=>{
          const bridge=this.#workspaceSession.bridge,operation=this.#appearanceCoordinator.operation;
          if(!bridge?.available)throw new BridgeUnavailableError();
          const result=await this.#setWindowTransparency(bridge,enabled);
          if(!this.#isCurrentAppearanceOperation(bridge,operation)){await this.#reconcilePersistedWindowTransparency();throw new DOMException('Native background operation was superseded.','AbortError');}
          return result.background;
        },
        present:background=>{if(background===undefined)this.#clearTransparentBackgroundPresentation();else this.#applyTransparentBackgroundPresentation(background);},
      });
    }

    #previewWorkspaceValue: PreviewWorkspaceController | undefined;
    get #previewWorkspace(): PreviewWorkspaceController {
      if(!this.#previewWorkspaceValue){const owner=this;this.#previewWorkspaceValue=new PreviewWorkspaceController({element:owner,collapse:collapsed=>owner.collapse(collapsed),reportEditingConflict:message=>owner.#previeweditingSettings.reportConflict(message),
        get state(){return owner.#state;},
        get context(){return owner.#workspaceSession.context;},
        get bridge(){return owner.#workspaceSession.bridge;},
        get mainPreviewSurface(){return owner.#mainPreviewSurface;},
        get editingPath(){return owner.#previeweditingSettings.drafts.path;},
        get leaveEditing(){return owner.#previeweditingSettings.leaveEditing.bind(owner.#previeweditingSettings);},
        get ensureMainPreview(){return owner.#ensureMainPreview.bind(owner);},
        get renderVisible(){return owner.#treeinteractionSettings.renderVisible.bind(owner.#treeinteractionSettings);},
        get settings(){return owner.#settings;},
        get announce(){return owner.#announce.bind(owner);},
        get generation(){return owner.#workspaceSession.generation;},
        get mainPreview(){return owner.#mainPreview;},
        get requestPreview(){return owner.#previewrequestsSettings.requestPreview.bind(owner.#previewrequestsSettings);},
        get editSaving(){return owner.#previeweditingSettings.drafts.saving;},
        get editError(){return owner.#previeweditingSettings.drafts.error;},
        get detachMainPreview(){return owner.#detachMainPreview.bind(owner);},
        get clearEditing(){return owner.#previeweditingSettings.clearEditing.bind(owner.#previeweditingSettings);},
        get editDraft(){return owner.#previeweditingSettings.drafts.text;},
        get enabledPreviewers(){return owner.#enabledPreviewers;},
        get syncEditModeButton(){return owner.#previeweditingSettings.syncEditModeButton.bind(owner.#previeweditingSettings);}
      });}
      return this.#previewWorkspaceValue;
    }

 readonly #mutations=new MutationGate();
    #externalDropValue: ExternalDropController | undefined;
    get #externalDrop(): ExternalDropController {
      if(!this.#externalDropValue){const owner=this;this.#externalDropValue=new ExternalDropController({element:owner,
        get rows(){return owner.#treeinteractionSettings.rows;},
        get contextTargetForRow(){return owner.#fileactionsSettings.contextTargetForRow.bind(owner.#fileactionsSettings);},
        get treeWindow(){return owner.#treeWindow;},
        get mutations(){return owner.#mutations;},
        get state(){return owner.#state;},
        get context(){return owner.#workspaceSession.context;},
        get bridge(){return owner.#workspaceSession.bridge;},
        get closeContextMenu(){return owner.#fileactionsSettings.closeContextMenu.bind(owner.#fileactionsSettings);},
        get hideActionNotice(){return owner.#hideActionNotice.bind(owner);},
        get cancelMarquee(){return owner.#treeinteractionSettings.cancelMarquee.bind(owner.#treeinteractionSettings);},
        get showActionNotice(){return owner.#showActionNotice.bind(owner);},
        get treeShell(){return owner.#treeShell;},
        get masthead(){return owner.#masthead;},
        get statePanel(){return owner.#statePanel;},
        get model(){return owner.#treeinteractionSettings.model;},
        get toggleDirectory(){return owner.#treeinteractionSettings.toggleDirectory.bind(owner.#treeinteractionSettings);},
        get generation(){return owner.#workspaceSession.generation;},
        get showActionProgress(){return owner.#showActionProgress.bind(owner);},
        get loadDirectory(){return owner.#directoryjobsSettings.loadDirectory.bind(owner.#directoryjobsSettings);},
        get focusIndex(){return owner.#treeinteractionSettings.focusIndex.bind(owner.#treeinteractionSettings);},
        get connected(){return owner.#connected;},
        get dismissed(){return owner.#dismissed;},
        get editingPath(){return owner.#previeweditingSettings.drafts.path;},
        get editSaving(){return owner.#previeweditingSettings.drafts.saving;},
        get isEditDirty(){return owner.#previeweditingSettings.isEditDirty.bind(owner.#previeweditingSettings);},
        get confirmDiscardEditing(){return owner.#previeweditingSettings.confirmDiscardEditing.bind(owner.#previeweditingSettings);},
        get requestEntryAction(){return owner.#fileactionsSettings.requestEntryAction.bind(owner.#fileactionsSettings);},
        get clearEditing(){return owner.#previeweditingSettings.clearEditing.bind(owner.#previeweditingSettings);},
        get closePreviewTabsWithin(){return owner.#previewWorkspace.closePreviewTabsWithin.bind(owner.#previewWorkspace);}
      });}
      return this.#externalDropValue;
    }

    #settingsPanelsValue: PanelCoordinator | undefined;
    get #settingsPanels(): PanelCoordinator {
      if(!this.#settingsPanelsValue){
        const panels=new PanelCoordinator();
        panels.register('ascii-tiles',focus=>this.#asciiTilesSettings.close(focus));
        panels.register('particle',focus=>this.#particleSettings.closeParticleSettings(focus));
        panels.register('black-hole',focus=>this.#blackholeSettings.closeBlackHoleSettings(focus));
        panels.register('glow-horizon',focus=>this.#glowhorizonSettings.closeGlowHorizonSettings(focus));
        panels.register('heavenly-cloud',focus=>this.#heavenlycloudSettings.closeHeavenlyCloudSettings(focus));
        panels.register('aurora-ionosphere',focus=>this.#auroraionosphereSettings.closeAuroraIonosphereSettings(focus));
        panels.register('milky-way',focus=>this.#milkywaySettings.closeMilkyWaySettings(focus));
        panels.register('mountain',focus=>this.#mountainSettings.closeMountain());
        panels.register('cloud-train',focus=>this.#cloudtrainSettings.closeCloudTrain());
        panels.register('pixel-sculpt',focus=>this.#pixelsculptSettings.closePixelSculpt());
        panels.register('blinking-squares',focus=>this.#blinkingsquaresSettings.closeBlinkingSquares());
        this.#settingsPanelsValue=panels;
      }
      return this.#settingsPanelsValue;
    }

    #backgroundActionsValue: BackgroundActions | undefined;
    get #backgroundActions(): BackgroundActions {
      if (!this.#backgroundActionsValue) {
        const owner=this;
        const entries=[{id:ASCII_TILES_BACKGROUND_PLUGIN_ID,packageId:"ascii-tiles",label:"ASCII Tiles Background",runtime:this.#asciiTilesRuntime},{id:PARTICLE_BACKGROUND_PLUGIN_ID,packageId:"particle-image",label:"Particle Image Background",runtime:this.#particleBackgroundController},{id:BLACK_HOLE_BACKGROUND_PLUGIN_ID,packageId:"black-hole",label:"Black Hole Background",runtime:this.#blackHoleBackgroundController},{id:GLOW_HORIZON_BACKGROUND_PLUGIN_ID,packageId:"glow-horizon",label:"Glow Horizon Background",runtime:this.#glowHorizonBackgroundController},{id:HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,packageId:"heavenly-cloud",label:"Heavenly Cloud Background",runtime:this.#heavenlyCloudBackgroundController},{id:AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,packageId:"aurora-ionosphere",label:"Aurora Ionosphere Background",runtime:this.#auroraIonosphereBackgroundController},{id:MILKY_WAY_BACKGROUND_PLUGIN_ID,packageId:"milky-way",label:"Milky Way Background",runtime:this.#milkyWayBackgroundController},{id:MOUNTAIN_BACKGROUND_PLUGIN_ID,packageId:"mountain",label:"Layered Mountain Background",runtime:this.#mountainController},{id:CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,packageId:"cloud-train",label:"Cloud Train Background",runtime:this.#cloudTrainController},{id:PIXEL_SCULPT_BACKGROUND_PLUGIN_ID,packageId:"pixel-sculpt",label:"Pixel Sculpt Background",runtime:this.#pixelSculptController},{id:BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,packageId:"blinking-squares",label:"Blinking Squares Background",runtime:this.#blinkingSquaresController}] as const;
        this.#backgroundActionsValue=new BackgroundActions({
          coordinator:this.#appearanceCoordinator, entries:[...entries,{id:TRANSPARENT_BACKGROUND_PLUGIN_ID,label:'Transparent Background',runtime:this.#nativeWindowBackground,activationOrder:'before-exclusion',preserveThemeOnExclusion:false}], get enabled(){return owner.#enabledAppearancePlugins;},
          connected:()=>this.#connected&&!this.#dismissed,
          initializationCurrent:generation=>this.#isCurrentBackgroundInitialization(generation),
          prepare:id=>id===TRANSPARENT_BACKGROUND_PLUGIN_ID?Promise.resolve():ensureBackgroundPackage(entries.find(entry=>entry.id===id)!.packageId),
          ready:operation=>this.#awaitBackgroundInitializations(operation),
          leaveNativeTransparency:async target=>{
            if(target===TRANSPARENT_BACKGROUND_PLUGIN_ID)return;
            if(this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)||document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE))await this.#nativeWindowBackground.disable();
          },
          reconcileNative:()=>this.#reconcilePersistedWindowTransparency(),
          transferTheme:id=>{const target=entries.find(entry=>entry.id===id)?.id;const lease=readParticleThemeLease();if(lease?.owner&&target&&lease.owner!==target)transferParticleThemeLease(lease.owner,target);},
          committed:()=>{
            if(entries.some(entry=>entry.runtime.enabled)){
              this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID);
              this.#clearTransparentBackgroundPresentation();this.#nativeWindowBackground.applied=false;
            }
            this.#writeEnabledAppearancePlugins();
          },
          changed:()=>this.#renderPreviewMarket(),suspendHealth:()=>this.#cancelAppearanceHealthCheck(),resumeHealth:()=>this.#scheduleAppearanceHealthCheck(),
          failed:(operation,error)=>{recordCaughtRuntimeError('background '+operation,error);this.#showActionNotice(error instanceof Error?error.message:String(error),'error');},
          announce:message=>this.#announce(message),
        });
      }
      return this.#backgroundActionsValue;
    }

    #treeinteractionSettingsValue: TreeInteractionController | undefined;
    get #treeinteractionSettings(): TreeInteractionController { if (!this.#treeinteractionSettingsValue) {
        const owner = this;
        this.#treeinteractionSettingsValue = new TreeInteractionController({activatePreviewPath:path=>{owner.#activePreviewPath=path;},
            element: owner, collapse: (collapsed) => owner.collapse(collapsed), get treeShell() { return owner.#treeShell; }, announce: (...args) => owner.#announce(...args), get fileFilterInput() { return owner.#fileFilterInput; }, get state() { return owner.#state; }, setState: (...args) => owner.#setState(...args), get fileFilterEmpty() { return owner.#fileFilterEmpty; }, renderStatus: (...args) => owner.#renderStatus(...args), get contextMenuTarget() { return owner.#fileactionsSettings.contextMenuTarget; }, get activePreviewPath() { return owner.#activePreviewPath; }, get dragSource() { return owner.#externalDrop.dragSource; }, get dropTargetPath() { return owner.#externalDrop.dropTargetPath; }, closeContextMenu: (...args) => owner.#fileactionsSettings.closeContextMenu(...args), get treeWindow() { return owner.#treeWindow; }, openPreviewTab: (...args) => owner.#previewWorkspace.openPreviewTab(...args), get settings() { return owner.#settings; }, get marqueeElement() { return owner.#marqueeElement; }, contextTargetForRow: (...args) => owner.#fileactionsSettings.contextTargetForRow(...args), rootContextTarget: (...args) => owner.#fileactionsSettings.rootContextTarget(...args), get shadow() { return owner.#shadow; }, openContextMenu: (...args) => owner.#fileactionsSettings.openContextMenu(...args), pasteFiles: (...args) => owner.#fileactionsSettings.pasteFiles(...args), deleteSelectedFiles: (...args) => owner.#fileactionsSettings.deleteSelectedFiles(...args), leaveEditing: (...args) => owner.#previeweditingSettings.leaveEditing(...args), syncMainPreview: (...args) => owner.#previewWorkspace.syncMainPreview(...args), loadDirectory: (...args) => owner.#directoryjobsSettings.loadDirectory(...args)
        });
    } return this.#treeinteractionSettingsValue; }
    #directoryjobsSettingsValue: DirectoryJobsController | undefined;
    get #directoryjobsSettings(): DirectoryJobsController { if (!this.#directoryjobsSettingsValue) {
        const owner = this;
        this.#directoryjobsSettingsValue = new DirectoryJobsController({get session(){return owner.#workspaceSession;},element: owner,get model() { return owner.#treeinteractionSettings.model; },renderTree: (...args) => owner.#treeinteractionSettings.renderTree(...args),get pendingMarks() { return owner.#pendingMarks; },setState: (...args) => owner.#setState(...args),announce: (...args) => owner.#announce(...args)});
    } return this.#directoryjobsSettingsValue; }
    #fileactionsSettingsValue: FileActionsController | undefined;
    get #fileactionsSettings(): FileActionsController { if (!this.#fileactionsSettingsValue) {
        const owner = this;
        this.#fileactionsSettingsValue = new FileActionsController({clearFileClipboard:expected=>owner.#treeinteractionSettings.clearFileClipboard(expected),get workspaceSession(){return owner.#workspaceSession;},get canUseBridge(){return owner.#canUseBridge.bind(owner);},get refreshLoadedDirectories(){return owner.#refreshLoadedDirectories.bind(owner);},get loadDirectory(){return owner.#directoryjobsSettings.loadDirectory.bind(owner.#directoryjobsSettings);},get model(){return owner.#treeinteractionSettings.model;},get element(){return owner;},get fileClipboard(){return owner.#treeinteractionSettings.fileClipboard;},get focusedIndex(){return owner.#treeinteractionSettings.focusedIndex;}, mutations:owner.#mutations, get context() { return owner.#workspaceSession.context; }, get bridge() { return owner.#workspaceSession.bridge; }, get state() { return owner.#state; }, get treeWindow() { return owner.#treeWindow; }, get rows() { return owner.#treeinteractionSettings.rows; }, get selectedPaths() { return owner.#treeinteractionSettings.selectedPaths; }, setSingleSelection: (...args) => owner.#treeinteractionSettings.setSingleSelection(...args), focusIndex: (...args) => owner.#treeinteractionSettings.focusIndex(...args), clearSelection: (...args) => owner.#treeinteractionSettings.clearSelection(...args), get treeShell() { return owner.#treeShell; }, hideActionNotice: (...args) => owner.#hideActionNotice(...args), get shadow() { return owner.#shadow; }, get statePanel() { return owner.#statePanel; }, get contextMenu() { return owner.#contextMenu; }, renderVisible: (...args) => owner.#treeinteractionSettings.renderVisible(...args), get editingPath() { return owner.#previeweditingSettings.drafts.path; }, isEditDirty: (...args) => owner.#previeweditingSettings.isEditDirty(...args), effectiveWidth: (...args) => owner.#effectiveWidth(...args), get connected() { return owner.#connected; }, get editSaving() { return owner.#previeweditingSettings.drafts.saving; }, showActionNotice: (...args) => owner.#showActionNotice(...args), openPreviewTab: (...args) => owner.#previewWorkspace.openPreviewTab(...args), clearEditing: (...args) => owner.#previeweditingSettings.clearEditing(...args), closePreviewTabsWithin: (...args) => owner.#previewWorkspace.closePreviewTabsWithin(...args)
        });
    } return this.#fileactionsSettingsValue; }
    #previeweditingSettingsValue: PreviewEditingController | undefined;
    get #previeweditingSettings(): PreviewEditingController { if (!this.#previeweditingSettingsValue) {
        const owner = this;
        this.#previeweditingSettingsValue = new PreviewEditingController({get connected(){return owner.#connected;},get dismissed(){return owner.#dismissed;},get workspaceSession(){return owner.#workspaceSession;},get activePreviewPath(){return owner.#activePreviewPath;},get editModeButton(){return owner.#editModeButton;},restoreDetachedTab:saved=>owner.#previewWorkspace.restoreDetachedTab(saved),activatePreviewPath:path=>{owner.#activePreviewPath=path;},
            element: owner, get previewTabs() { return owner.#previewWorkspace.tabStore.items; }, schedulePreview: (...args) => owner.#previewWorkspace.schedulePreview(...args), announce: (...args) => owner.#announce(...args), syncMainPreview: (...args) => owner.#previewWorkspace.syncMainPreview(...args), get threadId() { return owner.#workspaceSession.threadId; }, get nativeReconnectMarker() { return owner.#nativeReconnectMarker; }, ensureMainPreview: (...args) => owner.#ensureMainPreview(...args), renderVisible: (...args) => owner.#treeinteractionSettings.renderVisible(...args), get bridge() { return owner.#workspaceSession.bridge; }, get context() { return owner.#workspaceSession.context; }, get mainPreview() { return owner.#mainPreview; }, get generation() { return owner.#workspaceSession.generation; }, get previewSessionRevision() { return owner.#previewWorkspace.previewSessionRevision; }, flushQueuedMainPreviewReconcile: (...args) => owner.#flushQueuedMainPreviewReconcile(...args), flushQueuedThreadSwitch: (...args) => owner.#flushQueuedThreadSwitch(...args), previewView: (...args) => owner.#previewWorkspace.previewView(...args), flushQueuedNativeReconnect: (...args) => owner.#flushQueuedNativeReconnect(...args)
        });
    } return this.#previeweditingSettingsValue; }
    #previewrequestsSettingsValue: PreviewRequestsController | undefined;
    get #previewrequestsSettings(): PreviewRequestsController { if (!this.#previewrequestsSettingsValue) {
        const owner = this;
        this.#previewrequestsSettingsValue = new PreviewRequestsController({get session(){return owner.#workspaceSession;},get previewTabs() { return owner.#previewWorkspace.tabStore.items; },get enabledPreviewers() { return owner.#enabledPreviewers; },syncMainPreview: (...args) => owner.#previewWorkspace.syncMainPreview(...args),announce: (...args) => owner.#announce(...args),previewView: (...args) => owner.#previewWorkspace.previewView(...args),get connected() { return owner.#connected; },get dismissed() { return owner.#dismissed; },get previewSessionRevision() { return owner.#previewWorkspace.previewSessionRevision; },get mainPreview() { return owner.#mainPreview; },get mainPreviewSurface() { return owner.#mainPreviewSurface; },});
    } return this.#previewrequestsSettingsValue; }
    #updatesSettingsValue: UpdatesController | undefined;
    get #updatesSettings(): UpdatesController { if (!this.#updatesSettingsValue) {
        const owner = this;
        this.#updatesSettingsValue = new UpdatesController({ get versionFeedback() { return owner.#versionFeedback; }, get actionNotice() { return owner.#actionNotice; }, hideActionNotice: (...args) => owner.#hideActionNotice(...args), get state() { return owner.#state; }, get bridge() { return owner.#workspaceSession.bridge; }, renderStatus: (...args) => owner.#renderStatus(...args), showActionNotice: (...args) => owner.#showActionNotice(...args), showActionProgress: (...args) => owner.#showActionProgress(...args), get connected() { return owner.#connected; }, closePreviewMarket: (...args) => owner.#closePreviewMarket(...args), get updateMessage() { return owner.#updateMessage; }, get updatePopover() { return owner.#updatePopover; }, get statusCode() { return owner.#statusCode; }, get updateInstallButton() { return owner.#updateInstallButton; }, get updateLaterButton() { return owner.#updateLaterButton; }
        });
    } return this.#updatesSettingsValue; }
    #auroraionosphereSettingsValue: AuroraIonosphereSettingsController | undefined;
    get #auroraionosphereSettings(): AuroraIonosphereSettingsController { if (!this.#auroraionosphereSettingsValue) {
        const owner = this;
        this.#auroraionosphereSettingsValue = new AuroraIonosphereSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("aurora-ionosphere"),backgroundActions: owner.#backgroundActions,
            get enabledAppearancePlugins() { return owner.#enabledAppearancePlugins; }, get auroraIonosphereBackgroundController() { return owner.#auroraIonosphereBackgroundController; }, get auroraIonosphereNumericControls() { return owner.#auroraIonosphereNumericControls; }, get auroraIonospherePausedInput() { return owner.#auroraIonospherePausedInput; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get auroraIonosphereBackgroundButton() { return owner.#auroraIonosphereBackgroundButton; }, get auroraIonosphereQualityButtons() { return owner.#auroraIonosphereQualityButtons; }, get auroraIonosphereResetButton() { return owner.#auroraIonosphereResetButton; }, get auroraIonosphereReplayButton() { return owner.#auroraIonosphereReplayButton; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get auroraIonosphereSettingsPanel() { return owner.#auroraIonosphereSettingsPanel; }, get milkyWaySettingsOpen() { return owner.#milkywaySettings.milkyWaySettingsOpen; }, positionMilkyWaySettingsPanel: (...args) => owner.#milkywaySettings.positionMilkyWaySettingsPanel(...args), get previewMarketOpen() { return owner.#previewMarketOpen; }, togglePreviewMarket: (...args) => owner.#togglePreviewMarket(...args), get auroraIonosphereSettingsTrigger() { return owner.#auroraIonosphereSettingsTrigger; }, renderMilkyWayBackgroundPlugin: (...args) => owner.#milkywaySettings.renderMilkyWayBackgroundPlugin(...args), get auroraIonosphereSettingsCloseButton() { return owner.#auroraIonosphereSettingsCloseButton; }
        });
    } return this.#auroraionosphereSettingsValue; }
    #milkywaySettingsValue: MilkyWaySettingsController | undefined;
    get #milkywaySettings(): MilkyWaySettingsController { if (!this.#milkywaySettingsValue) {
        const owner = this;
        this.#milkywaySettingsValue = new MilkyWaySettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("milky-way"),backgroundActions: owner.#backgroundActions,
            get enabledAppearancePlugins() { return owner.#enabledAppearancePlugins; }, get milkyWayBackgroundController() { return owner.#milkyWayBackgroundController; }, get milkyWayNumericControls() { return owner.#milkyWayNumericControls; }, get shadow() { return owner.#shadow; }, required: (...args) => owner.#required(...args), get milkyWayPausedInput() { return owner.#milkyWayPausedInput; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get milkyWayBackgroundButton() { return owner.#milkyWayBackgroundButton; }, get milkyWayQualityButtons() { return owner.#milkyWayQualityButtons; }, get milkyWayResetButton() { return owner.#milkyWayResetButton; }, get milkyWayReplayButton() { return owner.#milkyWayReplayButton; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get milkyWaySettingsPanel() { return owner.#milkyWaySettingsPanel; }, get previewMarketOpen() { return owner.#previewMarketOpen; }, togglePreviewMarket: (...args) => owner.#togglePreviewMarket(...args), get milkyWaySettingsTrigger() { return owner.#milkyWaySettingsTrigger; }, get milkyWaySettingsCloseButton() { return owner.#milkyWaySettingsCloseButton; }
        });
    } return this.#milkywaySettingsValue; }
    #particleSettingsValue: ParticleSettingsController | undefined;
    get #particleSettings(): ParticleSettingsController { if (!this.#particleSettingsValue) {
        const owner = this;
        this.#particleSettingsValue = new ParticleSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("particle"),backgroundActions: owner.#backgroundActions,
            get particleBackgroundController() { return owner.#particleBackgroundController; }, get enabledAppearancePlugins() { return owner.#enabledAppearancePlugins; }, announce: (...args) => owner.#announce(...args), showActionNotice: (...args) => owner.#showActionNotice(...args), get particleMorphCurveEditor() { return owner.#particleMorphCurveEditor; }, backgroundText: (...args) => owner.#backgroundText(...args), get particleMorphCurveNodes() { return owner.#particleMorphCurveNodes; }, get particleMorphCurveStartHandle() { return owner.#particleMorphCurveStartHandle; }, get particleMorphCurveEndHandle() { return owner.#particleMorphCurveEndHandle; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get particleNumericControls() { return owner.#particleNumericControls; }, get particleImageTransformControls() { return owner.#particleImageTransformControls; }, get particleIntroEnabledInput() { return owner.#particleIntroEnabledInput; }, get particleAutoSwitchInput() { return owner.#particleAutoSwitchInput; }, get particleShowSourceInput() { return owner.#particleShowSourceInput; }, get particleBackgroundColorInput() { return owner.#particleBackgroundColorInput; }, get particleCursorInteractionInput() { return owner.#particleCursorInteractionInput; }, get particleLibraryGrid() { return owner.#particleLibraryGrid; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get particleBackgroundButton() { return owner.#particleBackgroundButton; }, get particleOpeningReplayButton() { return owner.#particleOpeningReplayButton; }, get particleImageTransformReset() { return owner.#particleImageTransformReset; }, get particleLibraryClear() { return owner.#particleLibraryClear; }, get particleLibraryUpload() { return owner.#particleLibraryUpload; }, get previewMarketOpen() { return owner.#previewMarketOpen; }, togglePreviewMarket: (...args) => owner.#togglePreviewMarket(...args), get particleSettingsTrigger() { return owner.#particleSettingsTrigger; }, get particleSettingsPanel() { return owner.#particleSettingsPanel; }, get particleSettingsCloseButton() { return owner.#particleSettingsCloseButton; }
        });
    } return this.#particleSettingsValue; }
    #blackholeSettingsValue: BlackHoleSettingsController | undefined;
    get #blackholeSettings(): BlackHoleSettingsController { if (!this.#blackholeSettingsValue) {
        const owner = this;
        this.#blackholeSettingsValue = new BlackHoleSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("black-hole"),backgroundActions: owner.#backgroundActions,
            get blackHoleBackgroundController() { return owner.#blackHoleBackgroundController; }, get enabledAppearancePlugins() { return owner.#enabledAppearancePlugins; }, get blackHoleNumericControls() { return owner.#blackHoleNumericControls; }, get blackHoleColorInputs() { return owner.#blackHoleColorInputs; }, get blackHolePausedInput() { return owner.#blackHolePausedInput; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get blackHoleBackgroundButton() { return owner.#blackHoleBackgroundButton; }, get blackHoleResetButton() { return owner.#blackHoleResetButton; }, get blackHolePresetButtons() { return owner.#blackHolePresetButtons; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get blackHoleSettingsPanel() { return owner.#blackHoleSettingsPanel; }, get previewMarketOpen() { return owner.#previewMarketOpen; }, togglePreviewMarket: (...args) => owner.#togglePreviewMarket(...args), get blackHoleSettingsTrigger() { return owner.#blackHoleSettingsTrigger; }, get blackHoleSettingsCloseButton() { return owner.#blackHoleSettingsCloseButton; }
        });
    } return this.#blackholeSettingsValue; }
    #glowhorizonSettingsValue: GlowHorizonSettingsController | undefined;
    get #glowhorizonSettings(): GlowHorizonSettingsController { if (!this.#glowhorizonSettingsValue) {
        const owner = this;
        this.#glowhorizonSettingsValue = new GlowHorizonSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("glow-horizon"),backgroundActions: owner.#backgroundActions,
            get glowHorizonBackgroundController() { return owner.#glowHorizonBackgroundController; }, get enabledAppearancePlugins() { return owner.#enabledAppearancePlugins; }, get glowHorizonNumericControls() { return owner.#glowHorizonNumericControls; }, get glowHorizonColorInputs() { return owner.#glowHorizonColorInputs; }, get glowHorizonInertialWheelInput() { return owner.#glowHorizonInertialWheelInput; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get glowHorizonBackgroundButton() { return owner.#glowHorizonBackgroundButton; }, get shadow() { return owner.#shadow; }, get glowHorizonResetButton() { return owner.#glowHorizonResetButton; }, get glowHorizonReplayButton() { return owner.#glowHorizonReplayButton; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get glowHorizonSettingsPanel() { return owner.#glowHorizonSettingsPanel; }, get previewMarketOpen() { return owner.#previewMarketOpen; }, togglePreviewMarket: (...args) => owner.#togglePreviewMarket(...args), get glowHorizonSettingsTrigger() { return owner.#glowHorizonSettingsTrigger; }, get glowHorizonSettingsCloseButton() { return owner.#glowHorizonSettingsCloseButton; }
        });
    } return this.#glowhorizonSettingsValue; }
    #heavenlycloudSettingsValue: HeavenlyCloudSettingsController | undefined;
    get #heavenlycloudSettings(): HeavenlyCloudSettingsController { if (!this.#heavenlycloudSettingsValue) {
        const owner = this;
        this.#heavenlycloudSettingsValue = new HeavenlyCloudSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("heavenly-cloud"),backgroundActions: owner.#backgroundActions,
            get heavenlyCloudBackgroundController() { return owner.#heavenlyCloudBackgroundController; }, get enabledAppearancePlugins() { return owner.#enabledAppearancePlugins; }, get heavenlyCloudNumericControls() { return owner.#heavenlyCloudNumericControls; }, get heavenlyCloudPausedInput() { return owner.#heavenlyCloudPausedInput; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get heavenlyCloudBackgroundButton() { return owner.#heavenlyCloudBackgroundButton; }, get heavenlyCloudQualityButtons() { return owner.#heavenlyCloudQualityButtons; }, get heavenlyCloudResetButton() { return owner.#heavenlyCloudResetButton; }, get heavenlyCloudReplayButton() { return owner.#heavenlyCloudReplayButton; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get heavenlyCloudSettingsPanel() { return owner.#heavenlyCloudSettingsPanel; }, get previewMarketOpen() { return owner.#previewMarketOpen; }, togglePreviewMarket: (...args) => owner.#togglePreviewMarket(...args), get heavenlyCloudSettingsTrigger() { return owner.#heavenlyCloudSettingsTrigger; }, get heavenlyCloudSettingsCloseButton() { return owner.#heavenlyCloudSettingsCloseButton; }
        });
    } return this.#heavenlycloudSettingsValue; }
    #mountainSettingsValue: MountainSettingsController | undefined;
    get #mountainSettings(): MountainSettingsController { if (!this.#mountainSettingsValue) {
        const owner = this;
        this.#mountainSettingsValue = new MountainSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("mountain"),backgroundActions: owner.#backgroundActions,
            get shadow() { return owner.#shadow; }, required: (...args) => owner.#required(...args), get previewMarketPopover() { return owner.#previewMarketPopover; }, get mountainController() { return owner.#mountainController; }, get appearanceTransitionPending() { return owner.#appearanceCoordinator.transitionPending; }, get appearancePluginPending() { return owner.#appearanceCoordinator.pluginPending; }, backgroundText: (...args) => owner.#backgroundText(...args), get backgroundPackageMarket() { return owner.#backgroundPackageMarket; },});
    } return this.#mountainSettingsValue; }
    #cloudtrainSettingsValue: CloudTrainSettingsController | undefined;
    get #cloudtrainSettings(): CloudTrainSettingsController { if (!this.#cloudtrainSettingsValue) {
        const owner = this;
        this.#cloudtrainSettingsValue = new CloudTrainSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("cloud-train"),backgroundActions: owner.#backgroundActions,
            get shadow() { return owner.#shadow; }, required: (...args) => owner.#required(...args), get previewMarketPopover() { return owner.#previewMarketPopover; }, get cloudTrainController() { return owner.#cloudTrainController; }, get appearanceTransitionPending() { return owner.#appearanceCoordinator.transitionPending; }, get appearancePluginPending() { return owner.#appearanceCoordinator.pluginPending; }, backgroundText: (...args) => owner.#backgroundText(...args), get backgroundPackageMarket() { return owner.#backgroundPackageMarket; },});
    } return this.#cloudtrainSettingsValue; }
    #startupSettingsValue: StartupSettingsController | undefined;
    get #startupSettings(): StartupSettingsController { if (!this.#startupSettingsValue) {
        const owner = this;
        this.#startupSettingsValue = new StartupSettingsController({ get shadow() { return owner.#shadow; }, get connected() { return owner.#connected; }, applyResponsivePlacement: (...args) => owner.#applyResponsivePlacement(...args), required: (...args) => owner.#required(...args), get backgroundPackageMarket() { return owner.#backgroundPackageMarket; }, get bridge() { return owner.#workspaceSession.bridge; }, showActionNotice: (...args) => owner.#showActionNotice(...args), get startupTransitionNativeSync() { return owner.#startupTransitionNativeSync; }, get previewMarketPopover() { return owner.#previewMarketPopover; },});
    } return this.#startupSettingsValue; }
    #blinkingsquaresSettingsValue: BlinkingSquaresSettingsController | undefined;
    get #blinkingsquaresSettings(): BlinkingSquaresSettingsController { if (!this.#blinkingsquaresSettingsValue) {
        const owner = this;
        this.#blinkingsquaresSettingsValue = new BlinkingSquaresSettingsController({backgroundActions: owner.#backgroundActions,
            get shadow() { return owner.#shadow; }, required: (...args) => owner.#required(...args), get previewMarketPopover() { return owner.#previewMarketPopover; }, get blinkingSquaresController() { return owner.#blinkingSquaresController; }, get appearanceTransitionPending() { return owner.#appearanceCoordinator.transitionPending; }, get appearancePluginPending() { return owner.#appearanceCoordinator.pluginPending; }, backgroundText: (...args) => owner.#backgroundText(...args), get backgroundPackageMarket() { return owner.#backgroundPackageMarket; },});
    } return this.#blinkingsquaresSettingsValue; }
    #pixelsculptSettingsValue: PixelSculptSettingsController | undefined;
    get #pixelsculptSettings(): PixelSculptSettingsController { if (!this.#pixelsculptSettingsValue) {
        const owner = this;
        this.#pixelsculptSettingsValue = new PixelSculptSettingsController({closeOtherSettings:()=>owner.#settingsPanels.closeOthers("pixel-sculpt"),backgroundActions: owner.#backgroundActions,
            get shadow() { return owner.#shadow; }, required: (...args) => owner.#required(...args), get pixelSculptController() { return owner.#pixelSculptController; }, get connected() { return owner.#connected; }, get previewMarketPopover() { return owner.#previewMarketPopover; }, get appearanceTransitionPending() { return owner.#appearanceCoordinator.transitionPending; }, get appearancePluginPending() { return owner.#appearanceCoordinator.pluginPending; }, get backgroundSettingsLanguage() { return owner.#backgroundSettingsLanguage; }, get backgroundPackageMarket() { return owner.#backgroundPackageMarket; },});
    } return this.#pixelsculptSettingsValue; }
    #githistorySettingsValue: GitHistorySettingsController | undefined;
    get #githistorySettings(): GitHistorySettingsController { if (!this.#githistorySettingsValue) {
        const owner = this;
        this.#githistorySettingsValue = new GitHistorySettingsController({openGitDiff:(hash,path)=>owner.#previewWorkspace.openGitDiff(hash,path), get frame() { return owner.#fileactionsSettings.frame; }, get gitHistoryOpenButton() { return owner.#gitHistoryOpenButton; }, closePreviewMarket: (...args) => owner.#closePreviewMarket(...args), get gitHistoryResizeHandle() { return owner.#gitHistoryResizeHandle; }, get gitHistoryList() { return owner.#gitHistoryList; }, get gitHistoryLoadMoreButton() { return owner.#gitHistoryLoadMoreButton; }, get gitHistoryRefreshButton() { return owner.#gitHistoryRefreshButton; }, get bridge() { return owner.#workspaceSession.bridge; }, get gitHistoryBackButton() { return owner.#gitHistoryBackButton; }, get gitHistoryDetail() { return owner.#gitHistoryDetail; },});
    } return this.#githistorySettingsValue; }
    readonly #shadow: ShadowRoot;
    readonly #asciiTilesRuntime=getAsciiTilesBackgroundController();
    readonly #asciiTilesSettings:AsciiTilesSettingsController;
    #asciiTilesUnsubscribe:(()=>void)|undefined;
    #asciiTilesInitialization:Promise<void>|undefined;
    readonly #surfaceOpacity: SurfaceOpacityPlugin;

    readonly #tracker = new ActiveThreadTracker();
    readonly #changeTimers = new Map<string, ReturnType<typeof setTimeout>>();
    readonly #refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
    readonly #pendingMarks = new Map<string, ChangeKind>();
    readonly #workspaceSession = new WorkspaceSession<ExplorerBridge>();
    #unsubscribe: (() => void) | undefined;
    #themeObserver: MutationObserver | undefined;
    #mountObserver: MutationObserver | undefined;
    #resizeObserver: ResizeObserver | undefined;
    #persistTimer: ReturnType<typeof setTimeout> | undefined;
    #refreshCommit: Promise<void> = Promise.resolve();
    #refreshRevision = 0;
    #connected = false;
    #homeViewActive = true;
    #homeScrollTop = 0;
    #domEventsBound = false;
    #state: ExplorerViewState = "booting";
    #stateDetail = "";
    get #activePreviewPath(): string | null { return this.#previewWorkspace.tabStore.activePath; }
    set #activePreviewPath(path: string | null) { this.#previewWorkspace.tabStore.activate(path); }
    #mainPreview: CodeCodexMainPreviewElement | undefined;
    #mainPreviewSurface: HTMLElement | undefined;
    #queuedThreadSwitch: {
        threadId: string | null;
        force: boolean;
    } | undefined;
    #queuedMainPreviewReconcile: {
        surface: HTMLElement | undefined;
    } | undefined;
    #queuedNativeReconnect: Readonly<BootstrapConfig> | undefined;
    #settings: ExplorerSettings = { ...DEFAULT_SETTINGS };
    #watching = false;
    #requestedPlacement = "inline";
    #inlineParent: Element | undefined;
    #inlineNextSibling: ChildNode | null = null;
    #reparenting = false;
    #nativeReconnectMarker: Readonly<BootstrapConfig> | undefined;
    #dismissed = false;
    #actionNoticeTimer: ReturnType<typeof setTimeout> | undefined;
    readonly #versionFeedback: VersionFeedback;
    readonly #enabledPreviewers = new Set<string>();
    readonly #enabledAppearancePlugins = new Set<string>();
    readonly #mountainController = getMountainBackgroundController();
    readonly #pixelSculptController = getPixelSculptBackgroundController();
    readonly #blinkingSquaresController = getBlinkingSquaresBackgroundController();
    #blinkingSquaresUnsubscribe: (() => void) | undefined;
    #blinkingSquaresInitialization: Promise<void> | undefined;
    #startupTransitionNativeSync: Promise<void> = Promise.resolve();
    #pixelSculptUnsubscribe: (() => void) | undefined;
    #pixelSculptInitialization: Promise<void> | undefined;
    readonly #cloudTrainController = getCloudTrainBackgroundController();
    #cloudTrainUnsubscribe: (() => void) | undefined;
    #cloudTrainInitialization: Promise<void> | undefined;
    #mountainUnsubscribe: (() => void) | undefined;
    #mountainInitialization: Promise<void> | undefined;
    readonly #appearanceCoordinator = new AppearanceCoordinator();
    #appearanceSyncQueued = false;
    #appearanceHealthPending = false;
    #appearanceHealthTimer: ReturnType<typeof setTimeout> | undefined;
    #appearanceInitializationGeneration = 0;
    #appearanceRpcTail: Promise<void> = Promise.resolve();
    #previewMarketOpen = false;
    #backgroundSettingsLanguage: BackgroundSettingsLanguage = "zh";
    #forcedColorsQuery: MediaQueryList | undefined;
    #reducedTransparencyQuery: MediaQueryList | undefined;
    readonly #treeShell: HTMLElement;
    readonly #treeWindow: HTMLElement;
    readonly #statePanel: HTMLElement;
    readonly #loadingVeil: HTMLElement;
    readonly #projectName: HTMLElement;
    readonly #rootLabel: HTMLElement;
    readonly #masthead: HTMLElement;
    readonly #editModeButton: HTMLButtonElement;
    readonly #statusCode: HTMLButtonElement;
    readonly #updatePopover: HTMLElement;
    readonly #updateMessage: HTMLElement;
    readonly #updateLaterButton: HTMLButtonElement;
    readonly #updateInstallButton: HTMLButtonElement;
    readonly #previewMarketButton: HTMLButtonElement;
    readonly #previewMarketPopover: HTMLElement;
    readonly #previewMarketList: HTMLElement;
    readonly #previewMarketCloseButton: HTMLButtonElement;
    readonly #gitHistoryOpenButton: HTMLButtonElement;
    readonly #gitHistoryResizeHandle: HTMLElement;
    readonly #gitHistoryCloseButton: HTMLButtonElement;
    readonly #gitHistoryRefreshButton: HTMLButtonElement;
    readonly #gitHistoryList: HTMLElement;
    readonly #gitHistoryLoadMoreButton: HTMLButtonElement;
    readonly #gitHistoryBackButton: HTMLButtonElement;
    readonly #gitHistoryDetail: HTMLElement;
    readonly #previewerButtons = new Map<string, HTMLButtonElement>();
    readonly #previewerStatuses = new Map<string, HTMLElement>();
    readonly #transparentBackgroundCard: HTMLElement;
    readonly #transparentBackgroundButton: HTMLButtonElement;
    readonly #transparentBackgroundStatus: HTMLElement;
    readonly #particleBackgroundController = getParticleBackgroundController();
    #particleBackgroundUnsubscribe: (() => void) | undefined;
    #particleBackgroundInitialization: Promise<void> | undefined;
    readonly #particleBackgroundButton: HTMLButtonElement;
    readonly #particleSettingsPanel: HTMLElement;
    readonly #particleSettingsTrigger: HTMLButtonElement;
    readonly #particleSettingsCloseButton: HTMLButtonElement;
    readonly #particleIntroEnabledInput: HTMLInputElement;
    readonly #particleOpeningReplayButton: HTMLButtonElement;
    readonly #particleNumericControls = new Map<ParticleNumericSettingKey, Readonly<{
        definition: ParticleNumericControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
        editor: HTMLInputElement;
    }>>();
    readonly #particleMorphCurveEditor: SVGSVGElement;
    readonly #particleMorphCurveStartHandle: SVGGElement;
    readonly #particleMorphCurveEndHandle: SVGGElement;
    readonly #particleMorphCurveNodes: SVGGElement;
    readonly #particleSourceDetails: HTMLDetailsElement;
    readonly #particleLibraryUpload: HTMLInputElement;
    readonly #particleLibraryClear: HTMLButtonElement;
    readonly #particleLibraryGrid: HTMLElement;
    readonly #particleImageTransformReset: HTMLButtonElement;
    readonly #particleImageTransformControls = new Map<ParticleImageTransformKey, Readonly<{
        definition: ParticleImageTransformControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
        editor: HTMLInputElement;
    }>>();
    readonly #particleAutoSwitchInput: HTMLInputElement;
    readonly #particleShowSourceInput: HTMLInputElement;
    readonly #particleBackgroundColorInput: HTMLInputElement;
    readonly #particleCursorInteractionInput: HTMLInputElement;
    readonly #blackHoleBackgroundController = getBlackHoleBackgroundController();
    #blackHoleBackgroundUnsubscribe: (() => void) | undefined;
    #blackHoleBackgroundInitialization: Promise<void> | undefined;
    readonly #blackHoleBackgroundButton: HTMLButtonElement;
    readonly #blackHoleSettingsPanel: HTMLElement;
    readonly #blackHoleSettingsTrigger: HTMLButtonElement;
    readonly #blackHoleSettingsCloseButton: HTMLButtonElement;
    #languageCleanup: (() => void) | undefined;
    #pinCleanup: (()=>void) | undefined;
    #languageSubscription: (() => void) | undefined;
    readonly #blackHoleNumericControls = new Map<BlackHoleNumericSettingKey, Readonly<{
        definition: BlackHoleNumericControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
    }>>();
    readonly #blackHoleColorInputs = new Map<BlackHoleColorSettingKey, HTMLInputElement>();
    readonly #blackHolePausedInput: HTMLInputElement;
    readonly #blackHoleResetButton: HTMLButtonElement;
    readonly #blackHolePresetButtons: readonly HTMLButtonElement[];
    readonly #glowHorizonBackgroundController = getGlowHorizonBackgroundController();
    #glowHorizonBackgroundUnsubscribe: (() => void) | undefined;
    #glowHorizonBackgroundInitialization: Promise<void> | undefined;
    readonly #glowHorizonBackgroundButton: HTMLButtonElement;
    readonly #glowHorizonSettingsPanel: HTMLElement;
    readonly #glowHorizonSettingsTrigger: HTMLButtonElement;
    readonly #glowHorizonSettingsCloseButton: HTMLButtonElement;
    readonly #glowHorizonNumericControls = new Map<GlowHorizonNumericSettingKey, Readonly<{
        definition: GlowHorizonNumericControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
    }>>();
    readonly #glowHorizonColorInputs = new Map<"rimColor" | "violetColor" | "blueColor" | "shadowColor", HTMLInputElement>();
    readonly #glowHorizonInertialWheelInput: HTMLInputElement;
    readonly #glowHorizonResetButton: HTMLButtonElement;
    readonly #glowHorizonReplayButton: HTMLButtonElement;
    readonly #heavenlyCloudBackgroundController = getHeavenlyCloudBackgroundController();
    #heavenlyCloudBackgroundUnsubscribe: (() => void) | undefined;
    #heavenlyCloudBackgroundInitialization: Promise<void> | undefined;
    readonly #heavenlyCloudBackgroundButton: HTMLButtonElement;
    readonly #heavenlyCloudSettingsPanel: HTMLElement;
    readonly #heavenlyCloudSettingsTrigger: HTMLButtonElement;
    readonly #heavenlyCloudSettingsCloseButton: HTMLButtonElement;
    readonly #heavenlyCloudNumericControls = new Map<HeavenlyCloudNumericSettingKey, Readonly<{
        definition: HeavenlyCloudNumericControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
    }>>();
    readonly #heavenlyCloudQualityButtons: readonly HTMLButtonElement[];
    readonly #heavenlyCloudPausedInput: HTMLInputElement;
    readonly #heavenlyCloudResetButton: HTMLButtonElement;
    readonly #heavenlyCloudReplayButton: HTMLButtonElement;
    readonly #auroraIonosphereBackgroundController = getAuroraIonosphereBackgroundController();
    #auroraIonosphereBackgroundUnsubscribe: (() => void) | undefined;
    #auroraIonosphereBackgroundInitialization: Promise<void> | undefined;
    readonly #auroraIonosphereBackgroundButton: HTMLButtonElement;
    readonly #auroraIonosphereSettingsPanel: HTMLElement;
    readonly #auroraIonosphereSettingsTrigger: HTMLButtonElement;
    readonly #auroraIonosphereSettingsCloseButton: HTMLButtonElement;
    readonly #auroraIonosphereNumericControls = new Map<AuroraIonosphereNumericSettingKey, Readonly<{
        definition: AuroraIonosphereNumericControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
    }>>();
    readonly #auroraIonosphereQualityButtons: readonly HTMLButtonElement[];
    readonly #auroraIonospherePausedInput: HTMLInputElement;
    readonly #auroraIonosphereResetButton: HTMLButtonElement;
    readonly #auroraIonosphereReplayButton: HTMLButtonElement;
    readonly #milkyWayBackgroundController = getMilkyWayBackgroundController();
    #milkyWayBackgroundUnsubscribe: (() => void) | undefined;
    #milkyWayBackgroundInitialization: Promise<void> | undefined;
    readonly #milkyWayBackgroundButton: HTMLButtonElement;
    readonly #milkyWaySettingsPanel: HTMLElement;
    readonly #milkyWaySettingsTrigger: HTMLButtonElement;
    readonly #milkyWaySettingsCloseButton: HTMLButtonElement;
    readonly #milkyWayNumericControls = new Map<MilkyWayNumericSettingKey, Readonly<{
        definition: MilkyWayNumericControlDefinition;
        input: HTMLInputElement;
        output: HTMLOutputElement;
    }>>();
    readonly #milkyWayQualityButtons: readonly HTMLButtonElement[];
    readonly #milkyWayPausedInput: HTMLInputElement;
    readonly #milkyWayResetButton: HTMLButtonElement;
    readonly #milkyWayReplayButton: HTMLButtonElement;
    readonly #liveRegion: HTMLElement;
    readonly #collapseButton: HTMLButtonElement;
    readonly #collapsedTab: HTMLButtonElement;
    readonly #refreshButton: HTMLButtonElement;
    readonly #disableButton: HTMLButtonElement;
    readonly #fileSearchToolbar: HTMLElement;
    readonly #fileFilterInput: HTMLInputElement;
    readonly #fileFilterEmpty: HTMLElement;
    readonly #resizeHandle: HTMLElement;
    readonly #contextMenu: HTMLElement;
    readonly #actionNotice: HTMLElement;
    readonly #marqueeElement: HTMLElement;
    constructor() {
        super();
        this.#shadow = this.attachShadow({ mode: "open" });
        observePluginControls(this.#shadow);
        this.#shadow.innerHTML = `
      <style>${styles}${SURFACE_OPACITY_TREE_CSS}</style>
      <div class="frame">
        <div class="activity-bus" aria-hidden="true"></div>
        <header class="masthead" data-root-visible="true">
          <div class="identity">
            <div class="eyebrow"><button class="edit-mode-toggle" type="button" aria-pressed="false" disabled>Read only</button></div>
            <h2 class="project-name">Code-Codex</h2>
            <div class="root-label">Waiting for local task</div>
          </div>
          <div class="masthead-actions">
            <button class="icon-button refresh" type="button" title="Refresh visible directories" aria-label="Refresh visible directories">${icons.refresh}</button>
            <button class="icon-button collapse" type="button" title="Collapse explorer" aria-label="Collapse explorer">${icons.collapse}</button>
            <button class="icon-button disable" type="button" title="Hide until a conversation is selected" aria-label="Hide Code-Codex until a conversation is selected">${icons.close}</button>
          </div>
        </header>
        <div class="file-search-toolbar" hidden>
          <label class="file-search">
            <span class="sr-only">Filter loaded files</span>
            <span class="file-search-icon" aria-hidden="true">${icons.search}</span>
            <input class="file-filter" name="file-filter" type="search" placeholder="Filter files…" aria-label="Filter loaded files" aria-controls="cle-tree" autocomplete="off" spellcheck="false">
          </label>
        </div>
        <div class="tree-shell" id="cle-tree" role="tree" aria-label="Project files" aria-multiselectable="true" tabindex="0">
          <div class="file-filter-empty" role="status" hidden>No loaded files match this filter.</div>
          <div class="tree-spacer"><div class="tree-window"></div><div class="tree-marquee" aria-hidden="true" hidden></div></div>
        </div>
        <section class="state" hidden></section>
        ${gitHistoryPanelMarkup()}
        <div class="loading-veil" aria-hidden="true"><span class="loading-chip">Switching project</span></div>
        <footer class="statusbar">
          <div class="preview-market-popover" id="cle-preview-market" role="dialog" aria-modal="false" aria-labelledby="cle-preview-market-title" hidden>
            <div class="preview-market-header">
              <h3 id="cle-preview-market-title">Preview Market</h3>
              <button class="preview-market-close" type="button" title="Close Preview Market" aria-label="Close Preview Market">${icons.close}</button>
            </div>
            <div class="preview-market-list">
              <div class="preview-market-categories" role="tablist" aria-label="Plugin categories">
                <button class="preview-market-category" type="button" role="tab" aria-selected="true" aria-controls="cle-appearance-section" data-preview-market-category="appearance">Appearance</button>
                <button class="preview-market-category" type="button" role="tab" aria-selected="false" aria-controls="cle-file-preview-section" data-preview-market-category="file-preview">File Preview</button>
                <button class="preview-market-category" type="button" role="tab" aria-selected="false" aria-controls="cle-developer-tools-section" data-preview-market-category="developer-tools">Tools</button>
              </div>
              <section class="preview-market-section" id="cle-appearance-section" role="tabpanel" data-preview-market-section="appearance">
                <div class="preview-market-section-list"><article class="preview-extension appearance-extension" data-appearance-plugin="code-codex.custom-background-background"><span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4 data-plugin-name>Custom Background</h4><span class="preview-extension-status custom-background-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action custom-background-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger custom-background-settings" aria-label="Configure Custom Background" aria-haspopup="dialog" aria-controls="cle-custom-background-settings" aria-expanded="false">${icons.sliders}</button></div></article>${asciiTilesCardMarkup()}${surfaceOpacityCardMarkup()}${transparentBackgroundCardMarkup()}${particleBackgroundCardMarkup()}${blackHoleBackgroundCardMarkup()}${glowHorizonBackgroundCardMarkup()}${heavenlyCloudBackgroundCardMarkup()}${auroraIonosphereBackgroundCardMarkup()}${milkyWayBackgroundCardMarkup()}${mountainCardMarkup()}${cloudTrainCardMarkup()}${pixelSculptCardMarkup()}${blinkingSquaresCardMarkup()}${startupTransitionCardMarkup()}</div>
              </section>
              <section class="preview-market-section" id="cle-file-preview-section" role="tabpanel" data-preview-market-section="file-preview" hidden>
                <div class="preview-market-section-list">${PREVIEWER_DEFINITIONS.map(previewerCardMarkup).join("")}</div>
              </section>
              <section class="preview-market-section" id="cle-developer-tools-section" role="tabpanel" data-preview-market-section="developer-tools" hidden>
                <div class="preview-market-section-list">${gitHistoryCardMarkup()}</div>
              </section>
            </div>
          </div>
          <button class="preview-market-button" type="button" aria-haspopup="dialog" aria-controls="cle-preview-market" aria-expanded="false">${icons.preview}<span>Preview Market</span></button>
          <div class="update-popover" id="cle-update-dialog" role="dialog" aria-modal="false" aria-labelledby="cle-update-title" aria-describedby="cle-update-message" hidden>
            <h3 id="cle-update-title">Code-Codex update available</h3>
            <p class="update-message" id="cle-update-message"></p>
            <div class="update-actions">
              <button class="update-later" type="button">Later</button>
              <button class="update-install" type="button">Update</button>
            </div>
          </div>
          <button class="status-code" type="button" title="Check GitHub for updates" aria-label="Check GitHub for updates" aria-haspopup="dialog" aria-controls="cle-update-dialog" aria-expanded="false">WAIT</button>
        </footer>
        <div class="action-notice" popover="manual" role="status" hidden></div>
        <div class="context-menu" role="menu" aria-label="Explorer actions" aria-busy="false" hidden></div>
        <div class="resize-handle" role="separator" aria-label="Resize explorer" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="480" aria-valuenow="260" tabindex="0"></div>
      </div>
      ${particleSettingsPanelMarkup()}
      ${blackHoleSettingsPanelMarkup()}
      ${glowHorizonSettingsPanelMarkup()}
      ${heavenlyCloudSettingsPanelMarkup()}
      ${auroraIonosphereSettingsPanelMarkup()}
      ${milkyWaySettingsPanelMarkup()}
      ${mountainPanelMarkup()}
      ${cloudTrainPanelMarkup()}
      ${pixelSculptPanelMarkup()}
      ${blinkingSquaresPanelMarkup()}
      ${startupTransitionPanelMarkup()}
      ${asciiTilesPanelMarkup()}${surfaceOpacityPanelMarkup(bilingualLabelMarkup)}
      <button class="collapsed-tab" type="button" title="Open Code-Codex" aria-label="Open Code-Codex">${icons.collapse}</button>
      <div class="sr-only live-region" aria-live="polite" aria-atomic="true"></div>
    `;
        applyPluginCardIcons(this.#shadow);
        const ownerForAscii=this;
        this.#asciiTilesSettings=new AsciiTilesSettingsController({shadow:this.#shadow,runtime:this.#asciiTilesRuntime,actions:{toggle:id=>this.#backgroundActions.toggle(id),deactivate:id=>this.#backgroundActions.deactivate(id),initialize:(id,generation)=>this.#backgroundActions.initialize(id,generation),get busy(){return ownerForAscii.#backgroundActions.busy;}},enabled:()=>this.#enabledAppearancePlugins.has(ASCII_TILES_BACKGROUND_PLUGIN_ID),closeOthers:()=>{this.#settingsPanels.closeOthers('ascii-tiles');this.#surfaceOpacity.close();},notice:message=>this.#showActionNotice(message,'error')});
        this.#surfaceOpacity = new SurfaceOpacityPlugin(this.#shadow, (zh, en) => this.#backgroundText(zh, en), message => this.#showActionNotice(message, "error"));
        this.#fileactionsSettings.frame = this.#required<HTMLElement>(".frame");
        this.#treeShell = this.#required<HTMLElement>(".tree-shell");
        this.#treeinteractionSettings.treeSpacer = this.#required<HTMLElement>(".tree-spacer");
        this.#treeWindow = this.#required<HTMLElement>(".tree-window");
        this.#statePanel = this.#required<HTMLElement>(".state");
        this.#loadingVeil = this.#required<HTMLElement>(".loading-veil");
        this.#projectName = this.#required<HTMLElement>(".project-name");
        this.#rootLabel = this.#required<HTMLElement>(".root-label");
        this.#masthead = this.#required<HTMLElement>(".masthead");
        this.#editModeButton = this.#required<HTMLButtonElement>(".edit-mode-toggle");
        this.#statusCode = this.#required<HTMLButtonElement>(".status-code");
        this.#versionFeedback = new VersionFeedback(this.#statusCode, () => this.#renderStatus());
        this.#updatePopover = this.#required<HTMLElement>(".update-popover");
        this.#updateMessage = this.#required<HTMLElement>(".update-message");
        this.#updateLaterButton = this.#required<HTMLButtonElement>(".update-later");
        this.#updateInstallButton = this.#required<HTMLButtonElement>(".update-install");
        this.#previewMarketButton = this.#required<HTMLButtonElement>(".preview-market-button");
        this.#previewMarketPopover = this.#required<HTMLElement>(".preview-market-popover");
        this.#previewMarketList = this.#required<HTMLElement>(".preview-market-list");
        this.#previewMarketCloseButton = this.#required<HTMLButtonElement>(".preview-market-close");
        this.#gitHistoryOpenButton = this.#required<HTMLButtonElement>(".git-history-open");
        this.#githistorySettings.gitHistoryPanel = this.#required<HTMLElement>(".git-history-panel");
        this.#gitHistoryResizeHandle = this.#required<HTMLElement>(".git-history-resize-handle");
        this.#gitHistoryCloseButton = this.#required<HTMLButtonElement>(".git-history-close");
        this.#gitHistoryRefreshButton = this.#required<HTMLButtonElement>(".git-history-refresh");
        this.#githistorySettings.gitHistoryBranch = this.#required<HTMLElement>(".git-history-branch");
        this.#githistorySettings.gitHistoryState = this.#required<HTMLElement>(".git-history-state");
        this.#gitHistoryList = this.#required<HTMLElement>(".git-history-list");
        this.#gitHistoryLoadMoreButton = this.#required<HTMLButtonElement>(".git-history-load-more");
        this.#githistorySettings.gitHistoryListView = this.#required<HTMLElement>(".git-history-list-view");
        this.#githistorySettings.gitHistoryDetailView = this.#required<HTMLElement>(".git-history-detail-view");
        this.#gitHistoryBackButton = this.#required<HTMLButtonElement>(".git-history-back");
        this.#gitHistoryDetail = this.#required<HTMLElement>(".git-history-detail");
        for (const previewer of PREVIEWER_DEFINITIONS) {
            const card = this.#required<HTMLElement>(`[data-preview-extension="${previewer.id}"]`);
            const button = card.querySelector<HTMLButtonElement>(".preview-extension-action");
            const status = card.querySelector<HTMLElement>(".preview-extension-status");
            if (!button || !status)
                throw new Error(`Preview Market is missing ${previewer.id}.`);
            this.#previewerButtons.set(previewer.id, button);
            this.#previewerStatuses.set(previewer.id, status);
        }
        this.#transparentBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}"]`);
        this.#transparentBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#transparentBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#particleSettings.particleBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"]`);
        this.#particleBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#particleSettings.particleBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#particleSettingsPanel = this.#required<HTMLElement>(".particle-settings-panel");
        this.#particleSettingsTrigger = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${PARTICLE_BACKGROUND_PLUGIN_ID}"] .particle-settings-trigger`);
        this.#particleSettingsCloseButton = this.#required<HTMLButtonElement>(".particle-settings-close");
        this.#particleIntroEnabledInput = this.#required<HTMLInputElement>("#cle-particle-intro-enabled");
        this.#particleOpeningReplayButton = this.#required<HTMLButtonElement>(".particle-opening-replay");
        for (const definition of PARTICLE_NUMERIC_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            const editor = this.#required<HTMLInputElement>(`#${definition.id}-value`);
            this.#particleNumericControls.set(definition.key, { definition, input, output, editor });
        }
        this.#particleMorphCurveEditor = this.#required<SVGSVGElement>(".particle-morph-curve-editor");
        this.#particleSettings.particleMorphCurvePath = this.#required<SVGPathElement>(".particle-morph-curve-path");
        this.#particleSettings.particleMorphCurvePathGlow = this.#required<SVGPathElement>(".particle-morph-curve-path-glow");
        this.#particleMorphCurveStartHandle = this.#required<SVGGElement>(".particle-morph-curve-handle-start");
        this.#particleMorphCurveEndHandle = this.#required<SVGGElement>(".particle-morph-curve-handle-end");
        this.#particleSettings.particleMorphCurveStartTangent = this.#required<SVGLineElement>(".particle-morph-curve-tangent-start");
        this.#particleSettings.particleMorphCurveEndTangent = this.#required<SVGLineElement>(".particle-morph-curve-tangent-end");
        this.#particleMorphCurveNodes = this.#required<SVGGElement>(".particle-morph-curve-nodes");
        this.#particleSettings.particleMorphCurveMode = this.#required<HTMLElement>(".particle-morph-curve-mode");
        this.#particleSettings.particleMorphCurveReset = this.#required<HTMLButtonElement>(".particle-morph-curve-reset");
        this.#particleSourceDetails = this.#required<HTMLDetailsElement>(".particle-source-details");
        this.#particleSettings.particleSourceCount = this.#required<HTMLElement>(".particle-source-count");
        this.#particleLibraryUpload = this.#required<HTMLInputElement>(".particle-library-upload");
        this.#particleLibraryClear = this.#required<HTMLButtonElement>(".particle-library-clear");
        this.#particleLibraryGrid = this.#required<HTMLElement>(".particle-library-grid");
        this.#particleSettings.particleImageTransformEditor = this.#required<HTMLElement>(".particle-image-transform-editor");
        this.#particleSettings.particleImageTransformThumb = this.#required<HTMLImageElement>(".particle-image-transform-thumb");
        this.#particleSettings.particleImageTransformName = this.#required<HTMLElement>(".particle-image-transform-name");
        this.#particleImageTransformReset = this.#required<HTMLButtonElement>(".particle-image-transform-reset");
        for (const definition of PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            const editor = this.#required<HTMLInputElement>(`#${definition.id}-value`);
            this.#particleImageTransformControls.set(definition.key, { definition, input, output, editor });
        }
        this.#particleAutoSwitchInput = this.#required<HTMLInputElement>("#cle-particle-auto-switch");
        this.#particleShowSourceInput = this.#required<HTMLInputElement>("#cle-particle-show-source");
        this.#particleBackgroundColorInput = this.#required<HTMLInputElement>("#cle-particle-background-color");
        this.#particleCursorInteractionInput = this.#required<HTMLInputElement>("#cle-particle-cursor-interaction");
        this.#particleSettings.particlePluginError = this.#required<HTMLElement>(".particle-plugin-error");
        this.#blackholeSettings.blackHoleBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}"]`);
        this.#blackHoleBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#blackholeSettings.blackHoleBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${BLACK_HOLE_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#blackHoleSettingsPanel = this.#required<HTMLElement>(".black-hole-settings-panel");
        this.#blackHoleSettingsTrigger = this.#required<HTMLButtonElement>(".black-hole-settings-trigger");
        this.#blackHoleSettingsCloseButton = this.#required<HTMLButtonElement>(".black-hole-settings-close");
        for (const definition of BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            this.#blackHoleNumericControls.set(definition.key, { definition, input, output });
        }
        for (const key of ["hotColor", "midColor", "coolColor"] as const) {
            this.#blackHoleColorInputs.set(key, this.#required<HTMLInputElement>(`[data-black-hole-color="${key}"]`));
        }
        this.#blackHolePausedInput = this.#required<HTMLInputElement>("#cle-black-hole-paused");
        this.#blackHoleResetButton = this.#required<HTMLButtonElement>(".black-hole-reset");
        this.#blackHolePresetButtons = Array.from(this.#shadow.querySelectorAll<HTMLButtonElement>("[data-black-hole-preset]"));
        this.#blackholeSettings.blackHolePluginError = this.#required<HTMLElement>(".black-hole-plugin-error");
        this.#glowhorizonSettings.glowHorizonBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}"]`);
        this.#glowHorizonBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#glowhorizonSettings.glowHorizonBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${GLOW_HORIZON_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#glowHorizonSettingsPanel = this.#required<HTMLElement>(".glow-horizon-settings-panel");
        this.#glowHorizonSettingsTrigger = this.#required<HTMLButtonElement>(".glow-horizon-settings-trigger");
        this.#glowHorizonSettingsCloseButton = this.#required<HTMLButtonElement>(".glow-horizon-settings-close");
        for (const definition of GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            this.#glowHorizonNumericControls.set(definition.key, { definition, input, output });
        }
        for (const key of ["rimColor", "violetColor", "blueColor", "shadowColor"] as const) {
            this.#glowHorizonColorInputs.set(key, this.#required<HTMLInputElement>(`[data-glow-horizon-color="${key}"]`));
        }
        this.#glowHorizonInertialWheelInput = this.#required<HTMLInputElement>("#cle-glow-inertial-wheel");
        this.#glowHorizonResetButton = this.#required<HTMLButtonElement>(".glow-horizon-reset");
        this.#glowHorizonReplayButton = this.#required<HTMLButtonElement>(".glow-horizon-replay");
        this.#glowhorizonSettings.glowHorizonPluginError = this.#required<HTMLElement>(".glow-horizon-plugin-error");
        this.#heavenlycloudSettings.heavenlyCloudBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}"]`);
        this.#heavenlyCloudBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#heavenlycloudSettings.heavenlyCloudBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#heavenlyCloudSettingsPanel = this.#required<HTMLElement>(".heavenly-cloud-settings-panel");
        this.#heavenlyCloudSettingsTrigger = this.#required<HTMLButtonElement>(".heavenly-cloud-settings-trigger");
        this.#heavenlyCloudSettingsCloseButton = this.#required<HTMLButtonElement>(".heavenly-cloud-settings-close");
        for (const definition of HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            this.#heavenlyCloudNumericControls.set(definition.key, { definition, input, output });
        }
        this.#heavenlyCloudQualityButtons = Array.from(this.#shadow.querySelectorAll<HTMLButtonElement>("[data-heavenly-cloud-quality]"));
        this.#heavenlyCloudPausedInput = this.#required<HTMLInputElement>("#cle-heavenly-cloud-paused");
        this.#heavenlyCloudResetButton = this.#required<HTMLButtonElement>(".heavenly-cloud-reset");
        this.#heavenlyCloudReplayButton = this.#required<HTMLButtonElement>(".heavenly-cloud-replay");
        this.#heavenlycloudSettings.heavenlyCloudPluginError = this.#required<HTMLElement>(".heavenly-cloud-plugin-error");
        this.#auroraionosphereSettings.auroraIonosphereBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}"]`);
        this.#auroraIonosphereBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#auroraionosphereSettings.auroraIonosphereBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#auroraIonosphereSettingsPanel = this.#required<HTMLElement>(".aurora-ionosphere-settings-panel");
        this.#auroraIonosphereSettingsTrigger = this.#required<HTMLButtonElement>(".aurora-ionosphere-settings-trigger");
        this.#auroraIonosphereSettingsCloseButton = this.#required<HTMLButtonElement>(".aurora-ionosphere-settings-close");
        for (const definition of AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            this.#auroraIonosphereNumericControls.set(definition.key, { definition, input, output });
        }
        this.#auroraIonosphereQualityButtons = Array.from(this.#shadow.querySelectorAll<HTMLButtonElement>("[data-aurora-ionosphere-quality]"));
        this.#auroraIonospherePausedInput = this.#required<HTMLInputElement>("#cle-aurora-ionosphere-paused");
        this.#auroraIonosphereResetButton = this.#required<HTMLButtonElement>(".aurora-ionosphere-reset");
        this.#auroraIonosphereReplayButton = this.#required<HTMLButtonElement>(".aurora-ionosphere-replay");
        this.#auroraionosphereSettings.auroraIonospherePluginError = this.#required<HTMLElement>(".aurora-ionosphere-plugin-error");
        this.#milkywaySettings.milkyWayBackgroundCard = this.#required<HTMLElement>(`[data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}"]`);
        this.#milkyWayBackgroundButton = this.#required<HTMLButtonElement>(`[data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}"] .preview-extension-action`);
        this.#milkywaySettings.milkyWayBackgroundStatus = this.#required<HTMLElement>(`[data-appearance-plugin="${MILKY_WAY_BACKGROUND_PLUGIN_ID}"] .preview-extension-status`);
        this.#milkyWaySettingsPanel = this.#required<HTMLElement>(".milky-way-settings-panel");
        this.#milkyWaySettingsTrigger = this.#required<HTMLButtonElement>(".milky-way-settings-trigger");
        this.#milkyWaySettingsCloseButton = this.#required<HTMLButtonElement>(".milky-way-settings-close");
        for (const definition of MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS) {
            const input = this.#required<HTMLInputElement>(`#${definition.id}`);
            const output = this.#required<HTMLOutputElement>(`output[for="${definition.id}"]`);
            this.#milkyWayNumericControls.set(definition.key, { definition, input, output });
        }
        this.#milkyWayQualityButtons = Array.from(this.#shadow.querySelectorAll<HTMLButtonElement>("[data-milky-way-quality]"));
        this.#milkyWayPausedInput = this.#required<HTMLInputElement>("#cle-milky-way-paused");
        this.#milkyWayResetButton = this.#required<HTMLButtonElement>(".milky-way-reset");
        this.#milkyWayReplayButton = this.#required<HTMLButtonElement>(".milky-way-replay");
        this.#milkywaySettings.milkyWayPluginError = this.#required<HTMLElement>(".milky-way-plugin-error");
        this.#liveRegion = this.#required<HTMLElement>(".live-region");
        this.#collapseButton = this.#required<HTMLButtonElement>(".collapse");
        this.#collapsedTab = this.#required<HTMLButtonElement>(".collapsed-tab");
        this.#refreshButton = this.#required<HTMLButtonElement>(".refresh");
        this.#disableButton = this.#required<HTMLButtonElement>(".disable");
        this.#fileSearchToolbar = this.#required<HTMLElement>(".file-search-toolbar");
        this.#fileFilterInput = this.#required<HTMLInputElement>(".file-filter");
        this.#fileFilterEmpty = this.#required<HTMLElement>(".file-filter-empty");
        this.#resizeHandle = this.#required<HTMLElement>(".resize-handle");
        this.#contextMenu = this.#required<HTMLElement>(".context-menu");
        this.#actionNotice = this.#required<HTMLElement>(".action-notice");
        this.#marqueeElement = this.#required<HTMLElement>(".tree-marquee");
    }
    connectedCallback(): void {
        if (this.#connected)
            return;
        this.#connected = true;
        const appearanceInitializationGeneration = ++this.#appearanceInitializationGeneration;
        this.#requestedPlacement = this.dataset.placement || "inline";
        this.#rememberInlineMount();
        this.#settings = this.#readLocalSettings();
        this.#backgroundSettingsLanguage = parameterLanguage();
        this.#languageCleanup = localizeOwnedUi(this.#shadow);
        this.#pinCleanup = attachPluginPins(this.#shadow);
        this.#languageSubscription = subscribeLanguage(() => this.#applyGlobalLanguage(parameterLanguage()));
        this.#syncBackgroundSettingsLanguagePresentation();
        for (const previewer of this.#readEnabledPreviewers())
            this.#enabledPreviewers.add(previewer);
        this.#enabledAppearancePlugins.clear();
        for (const plugin of this.#readEnabledAppearancePlugins())
            this.#enabledAppearancePlugins.add(plugin);
        let normalizedAppearancePlugins = false;
        if (this.#mountainController.stoppedForExternalThemeChange)
            this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);
        if (this.#cloudTrainController.stoppedForExternalThemeChange)
            this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
        if (this.#pixelSculptController.stoppedForExternalThemeChange)
            this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
        if (this.#blinkingSquaresController.stoppedForExternalThemeChange)
            this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
        if (this.#enabledAppearancePlugins.has(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID)) {
            this.#enabledAppearancePlugins.clear();
            this.#enabledAppearancePlugins.add(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
            this.#writeEnabledAppearancePlugins();
        }
        if (this.#enabledAppearancePlugins.has(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID)) {
            this.#enabledAppearancePlugins.clear();
            this.#enabledAppearancePlugins.add(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
            this.#writeEnabledAppearancePlugins();
        }
        if (this.#enabledAppearancePlugins.has(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID)) {
            this.#enabledAppearancePlugins.clear();
            this.#enabledAppearancePlugins.add(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
        }
        if (this.#enabledAppearancePlugins.has(MOUNTAIN_BACKGROUND_PLUGIN_ID)) {
            this.#enabledAppearancePlugins.clear();
            this.#enabledAppearancePlugins.add(MOUNTAIN_BACKGROUND_PLUGIN_ID);
            this.#writeEnabledAppearancePlugins();
        }
        if (this.#particleBackgroundController.stoppedForExternalThemeChange) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (this.#blackHoleBackgroundController.stoppedForExternalThemeChange) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (this.#glowHorizonBackgroundController.stoppedForExternalThemeChange) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (this.#milkyWayBackgroundController.stoppedForExternalThemeChange) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID)) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID) || normalizedAppearancePlugins;
        }
        else if (this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        else if (this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        else if (this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        else if (this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        else if (this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)) {
            normalizedAppearancePlugins = this.#enabledAppearancePlugins.delete(TRANSPARENT_BACKGROUND_PLUGIN_ID)
                || normalizedAppearancePlugins;
        }
        if (normalizedAppearancePlugins) {
            this.#writeEnabledAppearancePlugins();
        }
        this.#particleBackgroundUnsubscribe?.();
        this.#particleBackgroundUnsubscribe = this.#particleBackgroundController.subscribe(() => {
            if (!this.#connected)
                return;
            if (this.#particleBackgroundController.stoppedForExternalThemeChange
                && this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID)) {
                this.#writeEnabledAppearancePlugins();
            }
            this.#particleSettings.renderParticleBackgroundPlugin();
        });
        this.#particleBackgroundInitialization = this.#particleSettings.initializeParticleBackground(appearanceInitializationGeneration);
        this.#blackHoleBackgroundUnsubscribe?.();
        this.#blackHoleBackgroundUnsubscribe = this.#blackHoleBackgroundController.subscribe(() => {
            if (!this.#connected)
                return;
            if (this.#blackHoleBackgroundController.stoppedForExternalThemeChange
                && this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID)) {
                this.#writeEnabledAppearancePlugins();
            }
            this.#blackholeSettings.renderBlackHoleBackgroundPlugin();
        });
        this.#blackHoleBackgroundInitialization = this.#particleBackgroundInitialization
            .then(() => this.#blackholeSettings.initializeBlackHoleBackground(appearanceInitializationGeneration));
        this.#glowHorizonBackgroundUnsubscribe?.();
        this.#glowHorizonBackgroundUnsubscribe = this.#glowHorizonBackgroundController.subscribe(() => {
            if (!this.#connected)
                return;
            if (this.#glowHorizonBackgroundController.stoppedForExternalThemeChange
                && this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)) {
                this.#writeEnabledAppearancePlugins();
            }
            this.#glowhorizonSettings.renderGlowHorizonBackgroundPlugin();
        });
        this.#glowHorizonBackgroundInitialization = this.#blackHoleBackgroundInitialization
            .then(() => this.#glowhorizonSettings.initializeGlowHorizonBackground(appearanceInitializationGeneration));
        this.#heavenlyCloudBackgroundUnsubscribe?.();
        this.#heavenlyCloudBackgroundUnsubscribe = this.#heavenlyCloudBackgroundController.subscribe(() => {
            if (!this.#connected)
                return;
            if (this.#heavenlyCloudBackgroundController.stoppedForExternalThemeChange
                && this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)) {
                this.#writeEnabledAppearancePlugins();
            }
            this.#heavenlycloudSettings.renderHeavenlyCloudBackgroundPlugin();
        });
        this.#heavenlyCloudBackgroundInitialization = this.#glowHorizonBackgroundInitialization
            .then(() => this.#heavenlycloudSettings.initializeHeavenlyCloudBackground(appearanceInitializationGeneration));
        this.#auroraIonosphereBackgroundUnsubscribe?.();
        this.#auroraIonosphereBackgroundUnsubscribe = this.#auroraIonosphereBackgroundController.subscribe(() => {
            if (!this.#connected)
                return;
            if (this.#auroraIonosphereBackgroundController.stoppedForExternalThemeChange
                && this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)) {
                this.#writeEnabledAppearancePlugins();
            }
            this.#auroraionosphereSettings.renderAuroraIonosphereBackgroundPlugin();
            this.#milkywaySettings.renderMilkyWayBackgroundPlugin();
        });
        this.#auroraIonosphereBackgroundInitialization = this.#heavenlyCloudBackgroundInitialization
            .then(() => this.#auroraionosphereSettings.initializeAuroraIonosphereBackground(appearanceInitializationGeneration));
        this.#milkyWayBackgroundUnsubscribe?.();
        this.#milkyWayBackgroundUnsubscribe = this.#milkyWayBackgroundController.subscribe(() => {
            if (!this.#connected)
                return;
            if (this.#milkyWayBackgroundController.stoppedForExternalThemeChange
                && this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID)) {
                this.#writeEnabledAppearancePlugins();
            }
            this.#milkywaySettings.renderMilkyWayBackgroundPlugin();
        });
        this.#milkyWayBackgroundInitialization = this.#auroraIonosphereBackgroundInitialization
            .then(() => this.#milkywaySettings.initializeMilkyWayBackground(appearanceInitializationGeneration));
        this.#mountainUnsubscribe?.();
        this.#mountainUnsubscribe = this.#mountainController.subscribe(() => {
            if (this.#mountainController.stoppedForExternalThemeChange) {
                this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);
                this.#writeEnabledAppearancePlugins();
            }
            this.#mountainSettings.renderMountain();
            this.#cloudtrainSettings.renderCloudTrain();
        });
        this.#mountainInitialization = this.#milkyWayBackgroundInitialization!.then(()=>this.#backgroundActions.initialize(MOUNTAIN_BACKGROUND_PLUGIN_ID,appearanceInitializationGeneration));
        this.#mountainSettings.bindMountain();
        this.#cloudTrainUnsubscribe?.();
        this.#cloudTrainUnsubscribe = this.#cloudTrainController.subscribe(() => {
            if (this.#cloudTrainController.stoppedForExternalThemeChange) {
                this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
                this.#writeEnabledAppearancePlugins();
            }
            this.#cloudtrainSettings.renderCloudTrain();
        });
        this.#cloudTrainInitialization = this.#mountainInitialization!.then(()=>this.#backgroundActions.initialize(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,appearanceInitializationGeneration));
        this.#cloudtrainSettings.bindCloudTrain();
        this.#pixelSculptUnsubscribe?.();
        this.#pixelSculptUnsubscribe = this.#pixelSculptController.subscribe(() => {
            if (this.#pixelSculptController.stoppedForExternalThemeChange) {
                this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
                this.#writeEnabledAppearancePlugins();
            }
            this.#pixelsculptSettings.renderPixelSculpt();
        });
        this.#pixelSculptInitialization = this.#cloudTrainInitialization!.then(()=>this.#backgroundActions.initialize(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID,appearanceInitializationGeneration));
        this.#pixelsculptSettings.bindPixelSculpt();
        this.#blinkingSquaresUnsubscribe?.();
        this.#blinkingSquaresUnsubscribe = this.#blinkingSquaresController.subscribe(() => {
            if (this.#blinkingSquaresController.stoppedForExternalThemeChange) {
                this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
                this.#writeEnabledAppearancePlugins();
            }
            this.#blinkingsquaresSettings.renderBlinkingSquares();
        });
        this.#blinkingSquaresInitialization = this.#pixelSculptInitialization!.then(()=>this.#backgroundActions.initialize(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,appearanceInitializationGeneration));
        this.#blinkingsquaresSettings.bindBlinkingSquares();
        this.#startupSettings.bindStartupTransition();
        this.#asciiTilesSettings.start();
        this.#asciiTilesUnsubscribe?.();
        this.#asciiTilesUnsubscribe=this.#asciiTilesRuntime.subscribe(()=>{if(!this.#connected)return;if(this.#asciiTilesRuntime.stoppedForExternalThemeChange&&this.#enabledAppearancePlugins.delete(ASCII_TILES_BACKGROUND_PLUGIN_ID))this.#writeEnabledAppearancePlugins();this.#renderPreviewMarket();});
        this.#asciiTilesInitialization=this.#milkyWayBackgroundInitialization?.then(()=>this.#backgroundActions.initialize(ASCII_TILES_BACKGROUND_PLUGIN_ID,appearanceInitializationGeneration));
        this.#surfaceOpacity.start();
        this.#nativeWindowBackground.applied = undefined;
        this.#nativeWindowBackground.error = undefined;
        this.#renderPreviewMarket();
        this.#applySettings();
        this.#applyResponsivePlacement();
        this.#applyTheme();
        this.#bindDomEvents();
        const bootstrap = this.#nativeReconnectMarker ?? getBootstrapConfig();
        runtimeEvent("renderer", "bootstrap", "received", { version: bootstrap.version, codexVersion: bootstrap.codexVersion, compatible: bootstrap.compatible, supported: bootstrap.supported, appearancePlugins: [...this.#enabledAppearancePlugins], startupAnimationEnabled: readStartupTransitionSettings().enabled });
        this.#nativeReconnectMarker = bootstrap;
        const compatibility = assessBootstrapCompatibility(bootstrap);
        if (!compatibility.supported) {
            this.#setState("incompatible", compatibility.reason);
            return;
        }
        this.#workspaceSession.bridge = new ExplorerBridge(bootstrap.token ?? "", bootstrap.binding, bootstrap.receiver);
        this.#unsubscribe = this.#workspaceSession.bridge.subscribe((notification) => this.#onNotification(notification.method, notification.params));
        if (!this.#workspaceSession.bridge.available) {
            this.#setState("error", "NO_BRIDGE");
            return;
        }
        this.#versionFeedback.connect();
        void this.#updatesSettings.checkStartupVersion();
        this.#connectPackageMarket(this.#workspaceSession.bridge);
        this.#startupTransitionNativeSync = this.#startupSettings.syncStartupTransitionNativePreference(this.#workspaceSession.bridge);
        void this.#start(this.#workspaceSession.bridge, this.#workspaceSession.generation, bootstrap.manualWorkspace === true);
    }
    disconnectedCallback(): void {
        if (this.#reparenting)
            return;
        if (!this.#connected)
            return;
        // Native Settings can replace the entire workspace row during one React
        // commit. Decide after that commit, before disposing the retained bridge.
        queueMicrotask(() => {
            if (this.isConnected || !this.#connected)
                return;
            if (!this.#dismissed && !isExplorerDismissedForSession() &&
                window.__codeCodexRuntimeOwner?.tagName === this.localName && document.body) {
                this.setHomeViewActive(false);
                if (!this.isConnected)
                    this.#moveHost(document.body, null);
                return;
            }
            this.#disposeDisconnected();
        });
    }
    #disposeDisconnected(): void {
        if (this.#customBackgroundClick)
            this.#shadow.removeEventListener('click', this.#customBackgroundClick, true);
        this.#customBackgroundClick = undefined;
        this.#customBackground?.dispose();
        this.#customBackground = undefined;
        this.#languageCleanup?.();
        this.#pinCleanup?.();this.#pinCleanup=undefined;
        this.#languageCleanup = undefined;
        this.#languageSubscription?.();
        this.#languageSubscription = undefined;
        this.#backgroundPackageMarket?.dispose();
        this.#backgroundPackageMarket = undefined;
        this.#asciiTilesSettings.stop();
        this.#asciiTilesUnsubscribe?.();this.#asciiTilesUnsubscribe=undefined;
        this.#asciiTilesInitialization=undefined;
        this.#surfaceOpacity.stop();
        this.#fileactionsSettings.closeContextMenu(false);
        this.#closePreviewMarket(false);
        this.#startupSettings.startupVideoGeneration += 1;
        this.#startupSettings.startupTimelineFramesAbort?.abort();
        this.#startupSettings.stopStartupPreview();
        if (this.#startupSettings.startupStillUrl)
            URL.revokeObjectURL(this.#startupSettings.startupStillUrl);
        this.#startupSettings.startupStillUrl = undefined;
        this.#startupSettings.startupCinema?.dispose();
        this.#startupSettings.startupCinema = undefined;
        this.#startupSettings.startupLibraryUrls.forEach(url => URL.revokeObjectURL(url));
        this.#startupSettings.startupLibraryUrls = [];
        this.#updatesSettings.closeUpdateDialog(false);
        this.#externalDrop.clearDragState();
        this.#treeinteractionSettings.cancelMarquee();
        this.#previeweditingSettings.preserveDetachedDraft();
        this.#connected = false;
        this.#versionFeedback.dispose();
        this.#appearanceInitializationGeneration += 1;
        this.#particleBackgroundUnsubscribe?.();
        this.#particleBackgroundUnsubscribe = undefined;
        this.#particleBackgroundInitialization = undefined;
        this.#blackHoleBackgroundUnsubscribe?.();
        this.#blackHoleBackgroundUnsubscribe = undefined;
        this.#blackHoleBackgroundInitialization = undefined;
        this.#glowHorizonBackgroundUnsubscribe?.();
        this.#glowHorizonBackgroundUnsubscribe = undefined;
        this.#glowHorizonBackgroundInitialization = undefined;
        this.#heavenlyCloudBackgroundUnsubscribe?.();
        this.#heavenlyCloudBackgroundUnsubscribe = undefined;
        this.#heavenlyCloudBackgroundInitialization = undefined;
        this.#auroraIonosphereBackgroundUnsubscribe?.();
        this.#auroraIonosphereBackgroundUnsubscribe = undefined;
        this.#auroraIonosphereBackgroundInitialization = undefined;
        this.#milkyWayBackgroundUnsubscribe?.();
        this.#milkyWayBackgroundUnsubscribe = undefined;
        this.#mountainUnsubscribe?.();
        this.#mountainUnsubscribe = undefined;
        this.#mountainInitialization = undefined;
        this.#pixelSculptUnsubscribe?.();
        this.#pixelSculptUnsubscribe = undefined;
        this.#pixelSculptInitialization = undefined;
        this.#pixelsculptSettings.closePixelSculpt();
        this.#blinkingSquaresUnsubscribe?.();
        this.#blinkingSquaresUnsubscribe = undefined;
        this.#blinkingSquaresInitialization = undefined;
        this.#blinkingsquaresSettings.closeBlinkingSquares();
        this.#cloudTrainUnsubscribe?.();
        this.#cloudTrainUnsubscribe = undefined;
        this.#cloudTrainInitialization = undefined;
        this.#cloudtrainSettings.closeCloudTrain();
        this.#mountainSettings.closeMountain();
        this.#cloudtrainSettings.closeCloudTrain();
        this.#milkyWayBackgroundInitialization = undefined;
        this.#appearanceCoordinator.pluginPending = false;
        this.#appearanceCoordinator.transitionPending = false;
        this.#nativeWindowBackground.applied = undefined;
        this.#nativeWindowBackground.error = undefined;
        this.#appearanceSyncQueued = false;
        this.#appearanceHealthPending = false;
        this.#appearanceCoordinator.operation += 1;
        this.#updatesSettings.cancelUpdateCheck();
        this.#queuedThreadSwitch = undefined;
        this.#queuedMainPreviewReconcile = undefined;
        this.#queuedNativeReconnect = undefined;
        this.#workspaceSession.generation += 1;
        this.#previewWorkspace.purgePreviewTabs(false);
        this.#detachMainPreview();
        this.#tracker.stop();
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
        const bridge = this.#workspaceSession.bridge;
        this.#workspaceSession.bridge = undefined;
        if (bridge) {
            void this.#stopWatch(bridge).catch(() => undefined);
            bridge.dispose();
        }
        this.#themeObserver?.disconnect();
        this.#themeObserver = undefined;
        this.#mountObserver?.disconnect();
        this.#mountObserver = undefined;
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = undefined;
        this.#forcedColorsQuery?.removeEventListener("change", this.#onTransparencyPreferenceChange);
        this.#reducedTransparencyQuery?.removeEventListener("change", this.#onTransparencyPreferenceChange);
        window.removeEventListener("resize", this.#onWindowResize);
        window.removeEventListener("beforeunload", this.#onBeforeUnload);
        window.removeEventListener("pointerdown", this.#onWindowPointerDown, true);
        window.removeEventListener("dragend", this.#onWindowDragEnd, true);
        window.removeEventListener("keydown", this.#onWindowKeyDown, true);
        this.#clearTimers();
    }
    refresh(): void {
        if (!this.#workspaceSession.context || this.#state === "error") {
            this.reconnectNative(this.#nativeReconnectMarker ?? getBootstrapConfig(), true);
            return;
        }
        if (this.#state === "loading")
            return;
        void this.#refreshLoadedDirectories();
    }
    collapse(collapsed = true): void {
        if (this.#settings.collapsed !== collapsed)
            runtimeEvent("renderer", "file tree", collapsed ? "collapsed" : "expanded");
        this.#settings = { ...this.#settings, collapsed };
        if (collapsed) {
            this.#fileactionsSettings.closeContextMenu(false);
            this.#closePreviewMarket(false);
            this.#updatesSettings.closeUpdateDialog(false);
        }
        this.#applySettings();
        this.#persistSettings();
        this.#announce(collapsed ? "Explorer collapsed" : "Explorer opened");
        if (!collapsed) {
            this.#treeinteractionSettings.renderVisible();
            requestAnimationFrame(() => this.#treeShell.focus());
        }
    }
    openPreviewMarket(): void {
        if (!this.#previewMarketOpen)
            this.#togglePreviewMarket();
        else
            this.#previewMarketCloseButton.focus();
    }
    checkForUpdates(): void {
        void this.#updatesSettings.checkForUpdates();
    }
    openInstallationFolder(): void {
        if (!this.#workspaceSession.bridge?.available) {
            this.#showActionNotice("Code-Codex is disconnected", "error");
            return;
        }
        void this.#workspaceSession.bridge.request("explorer.installation.open").catch(error => {
            recordCaughtRuntimeError("open installation folder", error);
            if (this.#connected)
                this.#showActionNotice(error instanceof Error ? error.message : String(error), "error");
        });
    }
    async getLoginStartup(): Promise<import('../contracts/login-startup').LoginStartupStatus> {
        const bridge = this.#workspaceSession.bridge;
        if (!bridge?.available) throw new Error('Code-Codex is disconnected');
        return bridge.request('explorer.login.startup.get', {});
    }
    async setLoginStartup(enabled: boolean): Promise<import('../contracts/login-startup').LoginStartupStatus> {
        const bridge = this.#workspaceSession.bridge;
        if (!bridge?.available) throw new Error('Code-Codex is disconnected');
        return bridge.request('explorer.login.startup.set', { enabled });
    }
    async disable(): Promise<void> {
        if (this.#disableButton.disabled)
            return;
        this.#fileactionsSettings.closeContextMenu(false);
        this.#closePreviewMarket(false);
        this.#updatesSettings.closeUpdateDialog(false);
        if (!this.#previeweditingSettings.leaveEditing("Hide Code-Codex and discard your unsaved changes?"))
            return;
        this.#enabledAppearancePlugins.delete(ASCII_TILES_BACKGROUND_PLUGIN_ID);
        await this.#asciiTilesRuntime.disable();
        window.dispatchEvent(new Event('code-codex:custom-background-stop'));
        this.#disableButton.disabled = true;
        this.#dismissed = true;
        this.#appearanceCoordinator.operation += 1;
        this.#appearanceCoordinator.transitionPending = false;
        const particleWasEnabled = this.#enabledAppearancePlugins.delete(PARTICLE_BACKGROUND_PLUGIN_ID);
        const blackHoleWasEnabled = this.#enabledAppearancePlugins.delete(BLACK_HOLE_BACKGROUND_PLUGIN_ID);
        const glowHorizonWasEnabled = this.#enabledAppearancePlugins.delete(GLOW_HORIZON_BACKGROUND_PLUGIN_ID);
        const heavenlyCloudWasEnabled = this.#enabledAppearancePlugins.delete(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID);
        const auroraIonosphereWasEnabled = this.#enabledAppearancePlugins.delete(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID);
        const milkyWayWasEnabled = this.#enabledAppearancePlugins.delete(MILKY_WAY_BACKGROUND_PLUGIN_ID);
        const mountainWasEnabled = this.#enabledAppearancePlugins.delete(MOUNTAIN_BACKGROUND_PLUGIN_ID);
        const pixelSculptWasEnabled = this.#enabledAppearancePlugins.delete(PIXEL_SCULPT_BACKGROUND_PLUGIN_ID);
        const blinkingSquaresWasEnabled = this.#enabledAppearancePlugins.delete(BLINKING_SQUARES_BACKGROUND_PLUGIN_ID);
        if (blinkingSquaresWasEnabled)
            this.#writeEnabledAppearancePlugins();
        if (blinkingSquaresWasEnabled || this.#blinkingSquaresController.enabled || this.#blinkingSquaresController.pending)
            await this.#blinkingSquaresController.disable();
        if (pixelSculptWasEnabled)
            this.#writeEnabledAppearancePlugins();
        if (pixelSculptWasEnabled || this.#pixelSculptController.enabled || this.#pixelSculptController.pending)
            await this.#pixelSculptController.disable();
        const cloudTrainWasEnabled = this.#enabledAppearancePlugins.delete(CLOUD_TRAIN_BACKGROUND_PLUGIN_ID);
        if (cloudTrainWasEnabled)
            this.#writeEnabledAppearancePlugins();
        if (cloudTrainWasEnabled || this.#cloudTrainController.enabled || this.#cloudTrainController.pending)
            await this.#cloudTrainController.disable();
        if (particleWasEnabled || blackHoleWasEnabled || glowHorizonWasEnabled || heavenlyCloudWasEnabled || auroraIonosphereWasEnabled || milkyWayWasEnabled || mountainWasEnabled)
            this.#writeEnabledAppearancePlugins();
        if (mountainWasEnabled || this.#mountainController.enabled || this.#mountainController.pending)
            await this.#mountainController.disable();
        if (particleWasEnabled || this.#particleBackgroundController.enabled) {
            await this.#particleBackgroundController.disable();
        }
        if (blackHoleWasEnabled || this.#blackHoleBackgroundController.enabled) {
            await this.#blackHoleBackgroundController.disable();
        }
        if (glowHorizonWasEnabled || this.#glowHorizonBackgroundController.enabled) {
            await this.#glowHorizonBackgroundController.disable();
        }
        if (heavenlyCloudWasEnabled || this.#heavenlyCloudBackgroundController.enabled) {
            await this.#heavenlyCloudBackgroundController.disable();
        }
        if (auroraIonosphereWasEnabled || this.#auroraIonosphereBackgroundController.enabled) {
            await this.#auroraIonosphereBackgroundController.disable();
        }
        if (milkyWayWasEnabled || this.#milkyWayBackgroundController.enabled) {
            await this.#milkyWayBackgroundController.disable();
        }
        await this.#reconcilePersistedWindowTransparency();
        this.#previewWorkspace.purgePreviewTabs(false);
        dismissExplorerForSession();
        window.dispatchEvent(new Event("code-codex:dismiss"));
        this.#workspaceSession.generation += 1;
        this.#tracker.stop();
        const bridge = this.#workspaceSession.bridge;
        try {
            if (bridge?.available) {
                try {
                    await this.#stopWatch(bridge);
                }
                finally {
                    await this.#clearNativeContext(bridge);
                }
            }
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("disable", __codeCodexCaught);
            // Native context clear was attempted in the inner finally. Removal still
            // revokes the renderer surface if the bridge no longer accepts requests.
        }
        finally {
            this.remove();
        }
    }
    setHomeViewActive(active: boolean): void {
        if (this.#homeViewActive === active)
            return;
        runtimeEvent("renderer", "file tree visibility", active ? "shown" : "hidden", { reason: active ? "Home active" : "outside Home" });
        this.#homeViewActive = active;
        if (!active)
            this.#homeScrollTop = this.#treeShell.scrollTop;
        this.toggleAttribute("data-home-view-hidden", !active);
        this.toggleAttribute("inert", !active);
        if (active)
            this.removeAttribute("aria-hidden");
        else
            this.setAttribute("aria-hidden", "true");
        if (!active) {
            this.#fileactionsSettings.closeContextMenu(false);
            this.#closePreviewMarket(false);
            this.#updatesSettings.closeUpdateDialog(false);
            this.#externalDrop.clearDragState();
            this.#treeinteractionSettings.cancelMarquee();
            this.#mainPreview?.setSuspended(true);
            if (document.body) {
                this.#mainPreview?.reparent(document.body);
                this.#moveHost(document.body, null);
            }
        }
        else {
            requestAnimationFrame(() => {
                if (!this.#homeViewActive || !this.#connected)
                    return;
                this.#treeShell.scrollTop = this.#homeScrollTop;
                this.#treeinteractionSettings.renderVisible();
            });
        }
    }
    #loginBoundarySeen = false;
    reconcileLoginSession(login: boolean): void {
        if (login) {
            this.#loginBoundarySeen = true;
            return;
        }
        if (!this.#loginBoundarySeen || !this.#homeViewActive)
            return;
        this.#loginBoundarySeen = false;
        runtimeEvent('file-tree', 'account boundary', 'recovering', { errorCode: 'CC-SESSION-LOGIN-001', writesReplayed: false });
        this.reconnectNative(this.#nativeReconnectMarker ?? getBootstrapConfig(), true);
    }
    reconcileMount(parent: Element, before: ChildNode | null, placement: "inline" | "drawer", strategy: string): void {
        if (this.dataset.placement !== placement || this.dataset.mountStrategy !== strategy || this.parentElement !== parent)
            runtimeEvent('file-tree', 'mount', 'reconciled', { placement, strategy, homeActive: this.#homeViewActive, parentConnected: parent.isConnected });
        this.dataset.placement = placement;
        this.dataset.mountStrategy = strategy;
        this.#requestedPlacement = placement;
        const correctlyPlaced = this.parentElement === parent && (before === null || this.nextSibling === before);
        if (!correctlyPlaced)
            this.#moveHost(parent, before);
        if (placement === "inline") {
            this.#inlineParent = undefined;
            this.#inlineNextSibling = null;
            this.#rememberInlineMount();
        }
        this.#applyResponsivePlacement();
    }
    reconcileMainPreview(surface: HTMLElement | null): void {
        if (!this.#homeViewActive)
            return;
        const nextSurface = surface?.isConnected ? surface : undefined;
        const alreadyReconciled = nextSurface === this.#mainPreviewSurface &&
            (!this.#mainPreview || this.#mainPreview.parentElement === nextSurface);
        if (this.#previeweditingSettings.drafts.saving) {
            this.#queuedMainPreviewReconcile = alreadyReconciled ? undefined : { surface: nextSurface };
            return;
        }
        if (alreadyReconciled)
            return;
        this.#mainPreview?.setSuspended(true);
        this.#mainPreviewSurface = nextSurface;
        if (!nextSurface && document.body)
            this.#mainPreview?.reparent(document.body);
        if (nextSurface && this.#workspaceSession.context && !this.#previewWorkspace.tabStore.items.length && this.#previeweditingSettings.restoreDetachedDraft(this.#workspaceSession.context))
            return;
        if (nextSurface && this.#previewWorkspace.tabStore.items.length) {
            this.#ensureMainPreview();
            this.#previewWorkspace.syncMainPreview();
        }
    }
    reconnectNative(bootstrap: Readonly<BootstrapConfig> = getBootstrapConfig(), force = false): void {
        if (this.#dismissed)
            return;
        this.#fileactionsSettings.closeContextMenu(false);
        if (!force && this.#nativeReconnectMarker === bootstrap) {
            this.#queuedNativeReconnect = undefined;
            return;
        }
        if (!this.#connected) {
            this.#queuedNativeReconnect = undefined;
            this.#nativeReconnectMarker = bootstrap;
            return;
        }
        if (this.#previeweditingSettings.drafts.saving) {
            this.#queuedNativeReconnect = bootstrap;
            this.#announce("Code-Codex will reconnect after the current save finishes");
            return;
        }
        if (this.#previeweditingSettings.drafts.path && this.#previeweditingSettings.isEditDirty() &&
            !this.#previeweditingSettings.confirmDiscardEditing("Reconnect Code-Codex and discard your unsaved changes?")) {
            this.#queuedNativeReconnect = bootstrap;
            return;
        }
        this.#queuedNativeReconnect = undefined;
        this.#queuedThreadSwitch = undefined;
        if (this.#previeweditingSettings.drafts.path)
            this.#previeweditingSettings.clearEditing(false);
        this.#flushQueuedMainPreviewReconcile();
        this.#nativeReconnectMarker = bootstrap;
        const compatibility = assessBootstrapCompatibility(bootstrap);
        this.#workspaceSession.generation += 1;
        this.#previewWorkspace.purgePreviewTabs(false);
        this.#refreshRevision += 1;
        this.#clearWorkspaceTimers();
        this.#directoryjobsSettings.loads.clear();
        this.#tracker.stop();
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
        this.#watching = false;
        this.#workspaceSession.threadId = null;
        this.#workspaceSession.context = undefined;
        this.#appearanceCoordinator.pluginPending = false;
        this.#appearanceCoordinator.transitionPending = false;
        this.#nativeWindowBackground.applied = undefined;
        this.#nativeWindowBackground.error = undefined;
        this.#appearanceSyncQueued = false;
        this.#appearanceHealthPending = false;
        this.#appearanceCoordinator.operation += 1;
        this.#updatesSettings.cancelUpdateCheck();
        this.#cancelAppearanceHealthCheck();
        this.#clearTransparentBackgroundPresentation();
        this.#backgroundPackageMarket?.dispose();
        this.#backgroundPackageMarket = undefined;
        connectBackgroundPackages(undefined);
        this.#workspaceSession.bridge?.dispose();
        this.#workspaceSession.bridge = undefined;
        this.#renderAppearancePlugin();
        if (!compatibility.supported) {
            this.#setState("incompatible", compatibility.reason);
            return;
        }
        const bridge = new ExplorerBridge(bootstrap.token ?? "", bootstrap.binding, bootstrap.receiver);
        this.#workspaceSession.bridge = bridge;
        this.#unsubscribe = bridge.subscribe((notification) => this.#onNotification(notification.method, notification.params));
        if (!bridge.available) {
            this.#setState("error", "NO_BRIDGE");
            return;
        }
        this.#versionFeedback.connect();
        void this.#updatesSettings.checkStartupVersion();
        this.#connectPackageMarket(bridge);
        this.#setState("loading");
        void this.#start(bridge, this.#workspaceSession.generation, bootstrap.manualWorkspace === true);
    }
    async #start(bridge: WorkspaceBridge, generation: number, manualWorkspace: boolean): Promise<void> {
        await this.#syncPersistedAppearance(bridge, true);
        if (!this.#canUseBridge(bridge, generation))
            return;
        await this.#loadNativeSettings(bridge, generation);
        if (!this.#canUseBridge(bridge, generation))
            return;
        if (manualWorkspace) {
            await this.#switchThread("manual-workspace");
            return;
        }
        this.#tracker.start((threadId, homeView) => {
            this.setHomeViewActive(homeView);
            if (homeView)
                void this.#switchThread(threadId);
        });
    }
    #required<T extends Element>(selector: string): T {
        const element = this.#shadow.querySelector<T>(selector);
        if (!element)
            throw new Error(`Explorer template is missing ${selector}.`);
        return element;
    }
    #backgroundText(zh: string, en: string): string {
        return backgroundSettingsText(this.#backgroundSettingsLanguage, zh, en);
    }
    #syncBackgroundSettingsLanguagePresentation(): void {
        this.#asciiTilesSettings.render();
        this.#surfaceOpacity.render();
        const language = this.#backgroundSettingsLanguage;
        const english = language === "en";
        this.#customBackground?.setLanguage(language);
        for (const panel of [this.#required<HTMLElement>("#cle-surface-opacity-settings"), this.#particleSettingsPanel, this.#blackHoleSettingsPanel, this.#glowHorizonSettingsPanel, this.#heavenlyCloudSettingsPanel, this.#auroraIonosphereSettingsPanel, this.#milkyWaySettingsPanel, this.#required<HTMLElement>("#cle-mountain-settings"), this.#required<HTMLElement>("#cle-cloudTrain-settings"), this.#required<HTMLElement>("#cle-pixelSculpt-settings"), this.#required<HTMLElement>("#cle-blinkingSquares-settings"), this.#required<HTMLElement>("#cle-startupTransition-settings")]) {
            panel.dataset.language = language;
            panel.lang = language === "zh" ? "zh-CN" : "en";
        }
        const videoFit = this.#required<HTMLSelectElement>("#cle-startupTransition-fit");
        videoFit.options[0]!.textContent = english ? "Fill" : "铺满";
        videoFit.options[1]!.textContent = english ? "Contain" : "完整显示";
        videoFit.options[2]!.textContent = english ? "Cinema fill" : "影院填充";
        this.#particleSettingsCloseButton.title = this.#backgroundText("关闭粒子设置", "Close particle settings");
        this.#particleSettingsCloseButton.setAttribute("aria-label", this.#particleSettingsCloseButton.title);
        this.#blackHoleSettingsCloseButton.title = this.#backgroundText("关闭黑洞设置", "Close black hole settings");
        this.#blackHoleSettingsCloseButton.setAttribute("aria-label", this.#blackHoleSettingsCloseButton.title);
        this.#glowHorizonSettingsCloseButton.title = this.#backgroundText("关闭发光地平线设置", "Close Glow Horizon settings");
        this.#glowHorizonSettingsCloseButton.setAttribute("aria-label", this.#glowHorizonSettingsCloseButton.title);
        this.#heavenlyCloudSettingsCloseButton.title = this.#backgroundText("关闭天境云隧道设置", "Close Heavenly Cloud settings");
        this.#heavenlyCloudSettingsCloseButton.setAttribute("aria-label", this.#heavenlyCloudSettingsCloseButton.title);
        this.#auroraIonosphereSettingsCloseButton.title = this.#backgroundText("关闭极光电离层设置", "Close Aurora Ionosphere settings");
        this.#auroraIonosphereSettingsCloseButton.setAttribute("aria-label", this.#auroraIonosphereSettingsCloseButton.title);
        this.#milkyWaySettingsCloseButton.title = this.#backgroundText("关闭银河光场设置", "Close Milky Way settings");
        this.#milkyWaySettingsCloseButton.setAttribute("aria-label", this.#milkyWaySettingsCloseButton.title);
        for (const control of [...this.#particleNumericControls.values(), ...this.#particleImageTransformControls.values()]) {
            const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
            control.input.setAttribute("aria-label", label);
            control.output.title = this.#backgroundText("双击输入数值", "Double-click to enter a value");
            control.editor.setAttribute("aria-label", this.#backgroundText(`输入${control.definition.labelZh}`, `Enter ${control.definition.label} value`));
            this.#particleSettings.syncParticleValueControl(control, Number(control.input.value));
        }
        for (const control of this.#blackHoleNumericControls.values()) {
            control.input.setAttribute("aria-label", this.#backgroundText(control.definition.labelZh, control.definition.label));
            const row = control.input.closest<HTMLElement>(".particle-control-row");
            if (row)
                row.title = this.#backgroundText(control.definition.hintZh, control.definition.hint);
        }
        this.#particleMorphCurveNodes.setAttribute("aria-label", this.#backgroundText("中间变形关键帧", "Intermediate morph keyframes"));
        this.#particleMorphCurveStartHandle.setAttribute("aria-label", this.#backgroundText("输出控制点", "Outgoing curve handle"));
        this.#particleMorphCurveEndHandle.setAttribute("aria-label", this.#backgroundText("输入控制点", "Incoming curve handle"));
        this.#shadow.querySelector<HTMLElement>(".black-hole-preset-toolbar")?.setAttribute("aria-label", this.#backgroundText("黑洞场景预设", "Black hole scene presets"));
        this.#shadow.querySelector<HTMLElement>(".glow-horizon-direction-toolbar")?.setAttribute("aria-label", this.#backgroundText("地平线方向", "Horizon direction"));
        for (const control of this.#glowHorizonNumericControls.values()) {
            const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
            control.input.setAttribute("aria-label", label);
            const formatted = formatGlowHorizonControlValue(control.definition, Number(control.input.value));
            control.input.setAttribute("aria-valuetext", formatted);
        }
        for (const control of this.#heavenlyCloudNumericControls.values()) {
            const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
            control.input.setAttribute("aria-label", label);
            const formatted = formatHeavenlyCloudControlValue(control.definition, Number(control.input.value));
            control.input.setAttribute("aria-valuetext", formatted);
        }
        this.#shadow.querySelector<HTMLElement>(".heavenly-cloud-quality-toolbar")?.setAttribute("aria-label", this.#backgroundText("光线步数", "Ray steps"));
        for (const control of this.#auroraIonosphereNumericControls.values()) {
            const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
            control.input.setAttribute("aria-label", label);
            const formatted = formatAuroraIonosphereControlValue(control.definition, Number(control.input.value));
            control.input.setAttribute("aria-valuetext", formatted);
        }
        this.#shadow.querySelector<HTMLElement>(".aurora-ionosphere-quality-toolbar")?.setAttribute("aria-label", this.#backgroundText("光幕采样", "Curtain samples"));
        for (const control of this.#milkyWayNumericControls.values()) {
            const label = this.#backgroundText(control.definition.labelZh, control.definition.label);
            control.input.setAttribute("aria-label", label);
            const formatted = formatMilkyWayControlValue(control.definition, Number(control.input.value));
            control.input.setAttribute("aria-valuetext", formatted);
        }
        this.#shadow.querySelector<HTMLElement>(".milky-way-quality-toolbar")?.setAttribute("aria-label", this.#backgroundText("像素密度上限", "Pixel density limit"));
    }
    #applyGlobalLanguage(language: BackgroundSettingsLanguage): void {
        this.#backgroundSettingsLanguage = language;
        this.#syncBackgroundSettingsLanguagePresentation();
        // The owned-root adapter changes labels in place. Do not re-render
        // controllers or overwrite a focused numeric editor's uncommitted draft.
        if (this.#particleSettings.particleSettingsOpen)
            requestAnimationFrame(() => this.#particleSettings.positionParticleSettingsPanel());
        if (this.#blackholeSettings.blackHoleSettingsOpen)
            requestAnimationFrame(() => this.#blackholeSettings.positionBlackHoleSettingsPanel());
        if (this.#glowhorizonSettings.glowHorizonSettingsOpen)
            requestAnimationFrame(() => this.#glowhorizonSettings.positionGlowHorizonSettingsPanel());
        if (this.#heavenlycloudSettings.heavenlyCloudSettingsOpen)
            requestAnimationFrame(() => this.#heavenlycloudSettings.positionHeavenlyCloudSettingsPanel());
        if (this.#auroraionosphereSettings.auroraIonosphereSettingsOpen)
            requestAnimationFrame(() => this.#auroraionosphereSettings.positionAuroraIonosphereSettingsPanel());
        if (this.#milkywaySettings.milkyWaySettingsOpen)
            requestAnimationFrame(() => this.#milkywaySettings.positionMilkyWaySettingsPanel());
    }
    #bindDomEvents(): void {
        if (!this.#domEventsBound) {
            this.#domEventsBound = true;
            this.#collapseButton.addEventListener("click", () => this.collapse(true));
            this.#collapsedTab.addEventListener("click", () => this.collapse(false));
            this.#editModeButton.addEventListener("click", () => this.#previeweditingSettings.toggleEditing());
            this.#statusCode.addEventListener("click", () => {
                if (this.#updatesSettings.updateCandidate && this.#updatesSettings.updateCheckPresentation === "updateAvailable")
                    this.#updatesSettings.openUpdateDialog(this.#updatesSettings.updateCandidate);
                else
                    void this.#updatesSettings.checkForUpdates();
            });
            this.#updateLaterButton.addEventListener("click", () => this.#updatesSettings.closeUpdateDialog(true));
            this.#updateInstallButton.addEventListener("click", () => void this.#updatesSettings.installUpdate());
            this.#previewMarketButton.addEventListener("click", () => this.#togglePreviewMarket());
            this.#previewMarketCloseButton.addEventListener("click", () => this.#closePreviewMarket(true));
            this.#previewMarketList.addEventListener("click", (event) => {
                const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-preview-market-category]");
                const category = button?.dataset.previewMarketCategory;
                if (category === "appearance" || category === "file-preview" || category === "developer-tools") {
                    this.#selectPreviewMarketCategory(category);
                }
            });
            this.#gitHistoryOpenButton.addEventListener("click", () => this.#githistorySettings.toggleGitHistory());
            this.#gitHistoryCloseButton.addEventListener("click", () => this.#githistorySettings.closeGitHistory(true));
            this.#gitHistoryRefreshButton.addEventListener("click", () => void this.#githistorySettings.loadGitHistory(true));
            this.#gitHistoryResizeHandle.addEventListener("pointerdown", (event) => this.#githistorySettings.beginGitHistoryResize(event));
            this.#gitHistoryResizeHandle.addEventListener("pointermove", (event) => this.#githistorySettings.updateGitHistoryResize(event));
            this.#gitHistoryResizeHandle.addEventListener("pointerup", (event) => this.#githistorySettings.finishGitHistoryResize(event));
            this.#gitHistoryResizeHandle.addEventListener("pointercancel", (event) => this.#githistorySettings.finishGitHistoryResize(event));
            this.#gitHistoryResizeHandle.addEventListener("lostpointercapture", (event) => this.#githistorySettings.finishGitHistoryResize(event));
            this.#gitHistoryResizeHandle.addEventListener("keydown", (event) => this.#githistorySettings.onGitHistoryResizeKeyDown(event));
            this.#gitHistoryLoadMoreButton.addEventListener("click", () => void this.#githistorySettings.loadGitHistory(false));
            this.#gitHistoryBackButton.addEventListener("click", () => this.#githistorySettings.showGitHistoryList());
            this.#gitHistoryList.addEventListener("click", (event) => {
                const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-git-hash]");
                if (button?.dataset.gitHash)
                    void this.#githistorySettings.openGitCommit(button.dataset.gitHash);
            });
            this.#gitHistoryDetail.addEventListener("click", (event) => {
                const target = event.target as Element | null;
                const openButton = target?.closest<HTMLButtonElement>("button[data-git-open-file]");
                if (openButton?.dataset.gitOpenFile && openButton.dataset.gitHash) {
                    void this.#githistorySettings.openGitHistoryFile(openButton.dataset.gitHash, openButton.dataset.gitOpenFile);
                }
            });
            this.#transparentBackgroundButton.addEventListener("click", () => void this.#toggleTransparentBackground());
            this.#particleBackgroundButton.addEventListener("click", () => void this.#particleSettings.toggleParticleBackground());
            this.#blackHoleBackgroundButton.addEventListener("click", () => void this.#blackholeSettings.toggleBlackHoleBackground());
            this.#glowHorizonBackgroundButton.addEventListener("click", () => void this.#glowhorizonSettings.toggleGlowHorizonBackground());
            this.#heavenlyCloudBackgroundButton.addEventListener("click", () => void this.#heavenlycloudSettings.toggleHeavenlyCloudBackground());
            this.#auroraIonosphereBackgroundButton.addEventListener("click", () => void this.#auroraionosphereSettings.toggleAuroraIonosphereBackground());
            this.#milkyWayBackgroundButton.addEventListener("click", () => void this.#milkywaySettings.toggleMilkyWayBackground());
            this.#particleSettingsTrigger.addEventListener("click", () => this.#particleSettings.toggleParticleSettings());
            this.#particleSettingsCloseButton.addEventListener("click", () => this.#particleSettings.closeParticleSettings(true));
            this.#blackHoleSettingsTrigger.addEventListener("click", () => this.#blackholeSettings.toggleBlackHoleSettings());
            this.#blackHoleSettingsCloseButton.addEventListener("click", () => this.#blackholeSettings.closeBlackHoleSettings(true));
            this.#glowHorizonSettingsTrigger.addEventListener("click", () => this.#glowhorizonSettings.toggleGlowHorizonSettings());
            this.#glowHorizonSettingsCloseButton.addEventListener("click", () => this.#glowhorizonSettings.closeGlowHorizonSettings(true));
            this.#heavenlyCloudSettingsTrigger.addEventListener("click", () => this.#heavenlycloudSettings.toggleHeavenlyCloudSettings());
            this.#heavenlyCloudSettingsCloseButton.addEventListener("click", () => this.#heavenlycloudSettings.closeHeavenlyCloudSettings(true));
            this.#auroraIonosphereSettingsTrigger.addEventListener("click", () => this.#auroraionosphereSettings.toggleAuroraIonosphereSettings());
            this.#auroraIonosphereSettingsCloseButton.addEventListener("click", () => this.#auroraionosphereSettings.closeAuroraIonosphereSettings(true));
            this.#milkyWaySettingsTrigger.addEventListener("click", () => this.#milkywaySettings.toggleMilkyWaySettings());
            this.#milkyWaySettingsCloseButton.addEventListener("click", () => this.#milkywaySettings.closeMilkyWaySettings(true));
            this.#particleSettingsPanel.addEventListener("toggle", () => {
                if (this.#particleSettingsPanel.matches(":popover-open") || !this.#particleSettings.particleSettingsOpen)
                    return;
                this.#particleSettings.particleSettingsOpen = false;
                this.#particleSettingsTrigger.setAttribute("aria-expanded", "false");
                this.#particleSettings.cancelParticleValueEditors();
                this.#particleSettings.cancelParticleMorphCurveInteraction(true);
                this.#particleBackgroundController.finishImageTransformEditing();
                this.#particleSettings.particleTransformImageId = null;
            });
            this.#blackHoleSettingsPanel.addEventListener("toggle", () => {
                if (this.#blackHoleSettingsPanel.matches(":popover-open") || !this.#blackholeSettings.blackHoleSettingsOpen)
                    return;
                this.#blackholeSettings.blackHoleSettingsOpen = false;
                this.#blackHoleSettingsTrigger.setAttribute("aria-expanded", "false");
            });
            this.#glowHorizonSettingsPanel.addEventListener("toggle", () => {
                if (this.#glowHorizonSettingsPanel.matches(":popover-open") || !this.#glowhorizonSettings.glowHorizonSettingsOpen)
                    return;
                this.#glowhorizonSettings.glowHorizonSettingsOpen = false;
                this.#glowHorizonSettingsTrigger.setAttribute("aria-expanded", "false");
            });
            this.#heavenlyCloudSettingsPanel.addEventListener("toggle", () => {
                if (this.#heavenlyCloudSettingsPanel.matches(":popover-open") || !this.#heavenlycloudSettings.heavenlyCloudSettingsOpen)
                    return;
                this.#heavenlycloudSettings.heavenlyCloudSettingsOpen = false;
                this.#heavenlyCloudSettingsTrigger.setAttribute("aria-expanded", "false");
            });
            this.#auroraIonosphereSettingsPanel.addEventListener("toggle", () => {
                if (this.#auroraIonosphereSettingsPanel.matches(":popover-open") || !this.#auroraionosphereSettings.auroraIonosphereSettingsOpen)
                    return;
                this.#auroraionosphereSettings.auroraIonosphereSettingsOpen = false;
                this.#auroraIonosphereSettingsTrigger.setAttribute("aria-expanded", "false");
            });
            this.#milkyWaySettingsPanel.addEventListener("toggle", () => {
                if (this.#milkyWaySettingsPanel.matches(":popover-open") || !this.#milkywaySettings.milkyWaySettingsOpen)
                    return;
                this.#milkywaySettings.milkyWaySettingsOpen = false;
                this.#milkyWaySettingsTrigger.setAttribute("aria-expanded", "false");
            });
            this.#previewMarketList.addEventListener("scroll", () => {
                if (this.#particleSettings.particleSettingsOpen)
                    this.#particleSettings.positionParticleSettingsPanel();
                if (this.#blackholeSettings.blackHoleSettingsOpen)
                    this.#blackholeSettings.positionBlackHoleSettingsPanel();
                if (this.#glowhorizonSettings.glowHorizonSettingsOpen)
                    this.#glowhorizonSettings.positionGlowHorizonSettingsPanel();
                if (this.#heavenlycloudSettings.heavenlyCloudSettingsOpen)
                    this.#heavenlycloudSettings.positionHeavenlyCloudSettingsPanel();
                if (this.#auroraionosphereSettings.auroraIonosphereSettingsOpen)
                    this.#auroraionosphereSettings.positionAuroraIonosphereSettingsPanel();
                if (this.#milkywaySettings.milkyWaySettingsOpen)
                    this.#milkywaySettings.positionMilkyWaySettingsPanel();
            }, { passive: true });
            for (const control of this.#particleNumericControls.values()) {
                const { definition, input } = control;
                this.#particleSettings.bindParticleValueEditor(control);
                input.addEventListener("input", () => {
                    const normalized = normalizeParticleSettings({
                        ...this.#particleBackgroundController.settings,
                        [definition.key]: input.value,
                    })[definition.key];
                    this.#particleSettings.syncParticleValueControl(control, normalized);
                    if (definition.live)
                        void this.#particleSettings.applyParticleSettingsFromControls();
                });
                if (!definition.live) {
                    input.addEventListener("change", () => void this.#particleSettings.applyParticleSettingsFromControls());
                }
            }
            this.#particleSettings.bindParticleMorphCurveEditor();
            this.#particleIntroEnabledInput.addEventListener("change", () => void this.#particleSettings.applyParticleSettingsFromControls());
            this.#particleOpeningReplayButton.addEventListener("click", () => this.#particleBackgroundController.replayOpening());
            this.#particleAutoSwitchInput.addEventListener("change", () => void this.#particleSettings.applyParticleSettingsFromControls());
            this.#particleShowSourceInput.addEventListener("change", () => void this.#particleSettings.applyParticleSettingsFromControls());
            this.#particleBackgroundColorInput.addEventListener("input", () => void this.#particleSettings.applyParticleSettingsFromControls());
            this.#particleCursorInteractionInput.addEventListener("change", () => void this.#particleSettings.applyParticleSettingsFromControls());
            this.#particleLibraryUpload.addEventListener("change", () => {
                const files = Array.from(this.#particleLibraryUpload.files ?? []);
                this.#particleLibraryUpload.value = "";
                if (files.length)
                    void this.#particleBackgroundController.addImages(files);
            });
            this.#particleLibraryClear.addEventListener("click", () => this.#particleBackgroundController.clearOrder());
            this.#particleLibraryGrid.addEventListener("click", (event) => void this.#particleSettings.onParticleLibraryClick(event));
            for (const control of this.#particleImageTransformControls.values()) {
                const { definition, input } = control;
                this.#particleSettings.bindParticleValueEditor(control);
                input.addEventListener("input", () => {
                    const transform = this.#particleSettings.particleImageTransformFromControls();
                    this.#particleSettings.syncParticleValueControl(control, transform[definition.key]);
                    const id = this.#particleSettings.particleTransformImageId;
                    if (id)
                        this.#particleBackgroundController.previewImageTransform(id, transform);
                });
                input.addEventListener("change", () => void this.#particleSettings.saveParticleImageTransform());
            }
            this.#particleImageTransformReset.addEventListener("click", () => void this.#particleSettings.resetParticleImageTransform());
            for (const control of this.#blackHoleNumericControls.values()) {
                control.input.addEventListener("input", () => {
                    const normalized = normalizeBlackHoleSettings({
                        ...this.#blackHoleBackgroundController.settings,
                        [control.definition.key]: control.input.value,
                    })[control.definition.key];
                    const formatted = formatBlackHoleControlValue(control.definition, normalized);
                    control.output.textContent = formatted;
                    control.input.setAttribute("aria-valuetext", formatted);
                    this.#blackholeSettings.applyBlackHoleSettingsFromControls();
                });
            }
            for (const input of this.#blackHoleColorInputs.values()) {
                input.addEventListener("input", () => this.#blackholeSettings.applyBlackHoleSettingsFromControls());
            }
            this.#blackHolePausedInput.addEventListener("change", () => this.#blackholeSettings.applyBlackHoleSettingsFromControls());
            this.#blackHoleResetButton.addEventListener("click", () => this.#blackHoleBackgroundController.reset());
            for (const button of this.#blackHolePresetButtons) {
                button.addEventListener("click", () => {
                    const preset = button.dataset.blackHolePreset as BlackHolePresetName | undefined;
                    if (preset && preset in BLACK_HOLE_BACKGROUND_PRESETS)
                        this.#blackHoleBackgroundController.applyPreset(preset);
                });
            }
            for (const [key, control] of this.#glowHorizonNumericControls) {
                control.input.addEventListener("input", () => {
                    const normalized = normalizeGlowHorizonSettings({
                        ...this.#glowHorizonBackgroundController.settings,
                        [key]: control.input.value,
                    });
                    const value = normalized[key];
                    control.input.value = String(value);
                    const formatted = formatGlowHorizonControlValue(control.definition, value);
                    control.output.textContent = formatted;
                    control.input.setAttribute("aria-valuetext", formatted);
                    this.#glowhorizonSettings.applyGlowHorizonSettingsFromControls();
                });
            }
            this.#glowHorizonInertialWheelInput.addEventListener("change", () => this.#glowhorizonSettings.applyGlowHorizonSettingsFromControls());
            for (const input of this.#glowHorizonColorInputs.values()) {
                input.addEventListener("input", () => this.#glowhorizonSettings.applyGlowHorizonSettingsFromControls());
            }
            this.#glowHorizonResetButton.addEventListener("click", () => {
                this.#glowHorizonBackgroundController.reset();
                this.#glowHorizonBackgroundController.replay();
            });
            this.#glowHorizonReplayButton.addEventListener("click", () => this.#glowHorizonBackgroundController.replay());
            for (const button of this.#shadow.querySelectorAll<HTMLButtonElement>("[data-glow-horizon-direction]")) {
                button.addEventListener("click", () => {
                    const variant = button.dataset.glowHorizonDirection;
                    if (variant !== "top" && variant !== "bottom" && variant !== "left" && variant !== "right")
                        return;
                    this.#glowHorizonBackgroundController.updateSettings({
                        ...this.#glowHorizonBackgroundController.settings,
                        variant,
                    });
                });
            }
            for (const [key, control] of this.#heavenlyCloudNumericControls) {
                control.input.addEventListener("input", () => {
                    const normalized = normalizeHeavenlyCloudSettings({
                        ...this.#heavenlyCloudBackgroundController.settings,
                        [key]: control.input.value,
                    });
                    const value = normalized[key];
                    control.input.value = String(value);
                    const formatted = formatHeavenlyCloudControlValue(control.definition, value);
                    control.output.textContent = formatted;
                    control.input.setAttribute("aria-valuetext", formatted);
                    this.#heavenlycloudSettings.applyHeavenlyCloudSettingsFromControls();
                });
            }
            this.#heavenlyCloudPausedInput.addEventListener("change", () => this.#heavenlycloudSettings.applyHeavenlyCloudSettingsFromControls());
            this.#heavenlyCloudResetButton.addEventListener("click", () => {
                this.#heavenlyCloudBackgroundController.reset();
                this.#heavenlyCloudBackgroundController.replay();
            });
            this.#heavenlyCloudReplayButton.addEventListener("click", () => this.#heavenlyCloudBackgroundController.replay());
            for (const button of this.#heavenlyCloudQualityButtons) {
                button.addEventListener("click", () => {
                    const quality = button.dataset.heavenlyCloudQuality;
                    if (quality !== "low" && quality !== "medium" && quality !== "high")
                        return;
                    this.#heavenlyCloudBackgroundController.updateSettings({
                        ...this.#heavenlyCloudBackgroundController.settings,
                        quality,
                    });
                });
            }
            for (const [key, control] of this.#auroraIonosphereNumericControls) {
                control.input.addEventListener("input", () => {
                    const normalized = normalizeAuroraIonosphereSettings({
                        ...this.#auroraIonosphereBackgroundController.settings,
                        [key]: control.input.value,
                    });
                    const value = normalized[key];
                    control.input.value = String(value);
                    const formatted = formatAuroraIonosphereControlValue(control.definition, value);
                    control.output.textContent = formatted;
                    control.input.setAttribute("aria-valuetext", formatted);
                    this.#auroraionosphereSettings.applyAuroraIonosphereSettingsFromControls();
                });
            }
            this.#auroraIonospherePausedInput.addEventListener("change", () => this.#auroraionosphereSettings.applyAuroraIonosphereSettingsFromControls());
            this.#auroraIonosphereResetButton.addEventListener("click", () => {
                this.#auroraIonosphereBackgroundController.reset();
                this.#auroraIonosphereBackgroundController.replay();
            });
            this.#auroraIonosphereReplayButton.addEventListener("click", () => this.#auroraIonosphereBackgroundController.replay());
            for (const button of this.#auroraIonosphereQualityButtons) {
                button.addEventListener("click", () => {
                    const quality = button.dataset.auroraIonosphereQuality;
                    if (quality !== "low" && quality !== "medium" && quality !== "high")
                        return;
                    this.#auroraIonosphereBackgroundController.updateSettings({
                        ...this.#auroraIonosphereBackgroundController.settings,
                        quality,
                    });
                });
            }
            for (const [key, control] of this.#milkyWayNumericControls) {
                control.input.addEventListener("input", () => {
                    const normalized = normalizeMilkyWaySettings({
                        ...this.#milkyWayBackgroundController.settings,
                        [key]: control.input.value,
                    });
                    const value = normalized[key];
                    control.input.value = String(value);
                    const formatted = formatMilkyWayControlValue(control.definition, value);
                    control.output.textContent = formatted;
                    control.input.setAttribute("aria-valuetext", formatted);
                    this.#milkywaySettings.applyMilkyWaySettingsFromControls();
                });
            }
            for (const input of this.#shadow.querySelectorAll<HTMLInputElement>("[data-milky-way-color], #cle-milky-way-intro-enabled")) {
                input.addEventListener("input", () => this.#milkywaySettings.applyMilkyWaySettingsFromControls());
            }
            this.#milkyWayPausedInput.addEventListener("change", () => this.#milkywaySettings.applyMilkyWaySettingsFromControls());
            this.#milkyWayResetButton.addEventListener("click", () => {
                this.#milkyWayBackgroundController.reset();
                this.#milkyWayBackgroundController.replay();
            });
            this.#milkyWayReplayButton.addEventListener("click", () => this.#milkyWayBackgroundController.replay());
            for (const button of this.#milkyWayQualityButtons) {
                button.addEventListener("click", () => {
                    const quality = button.dataset.milkyWayQuality;
                    if (quality !== "low" && quality !== "medium" && quality !== "high")
                        return;
                    this.#milkyWayBackgroundController.updateSettings({
                        ...this.#milkyWayBackgroundController.settings,
                        quality,
                    });
                });
            }
            for (const previewer of PREVIEWER_DEFINITIONS) {
                this.#previewerButtons.get(previewer.id)?.addEventListener("click", () => this.#togglePreviewer(previewer));
            }
            this.#disableButton.addEventListener("click", () => void this.disable());
            this.#fileFilterInput.addEventListener("input", () => this.#treeinteractionSettings.applyFileFilter(this.#fileFilterInput.value));
            this.#fileFilterInput.addEventListener("keydown", (event) => this.#treeinteractionSettings.onFileFilterKeyDown(event));
            this.#refreshButton.addEventListener("click", () => this.refresh());
            this.#treeShell.addEventListener("scroll", () => {
                this.#fileactionsSettings.closeContextMenu(false);
                this.#treeinteractionSettings.renderVisible();
            });
            this.#treeShell.addEventListener("keydown", (event) => this.#treeinteractionSettings.onTreeKeyDown(event));
            this.#treeShell.addEventListener("click", (event) => this.#treeinteractionSettings.onTreeClick(event));
            this.#treeShell.addEventListener("dblclick", (event) => this.#treeinteractionSettings.onTreeDoubleClick(event));
            this.#treeShell.addEventListener("contextmenu", (event) => this.#fileactionsSettings.onTreeContextMenu(event));
            this.#treeShell.addEventListener("dragstart", (event) => this.#externalDrop.onTreeDragStart(event));
            this.#treeShell.addEventListener("pointerdown", (event) => this.#treeinteractionSettings.onTreePointerDown(event));
            this.#treeShell.addEventListener("pointermove", (event) => this.#treeinteractionSettings.onTreePointerMove(event));
            this.#treeShell.addEventListener("pointerup", (event) => this.#treeinteractionSettings.onTreePointerUp(event));
            this.#treeShell.addEventListener("pointercancel", () => this.#treeinteractionSettings.cancelMarquee());
            this.#treeShell.addEventListener("dragover", (event) => this.#externalDrop.onDropZoneDragOver(event, true));
            this.#treeShell.addEventListener("dragleave", (event) => this.#externalDrop.onDropZoneDragLeave(event));
            this.#treeShell.addEventListener("drop", (event) => this.#externalDrop.onDropZoneDrop(event, true));
            this.#masthead.addEventListener("dragover", (event) => this.#externalDrop.onDropZoneDragOver(event, true));
            this.#masthead.addEventListener("dragleave", (event) => this.#externalDrop.onDropZoneDragLeave(event));
            this.#masthead.addEventListener("drop", (event) => this.#externalDrop.onDropZoneDrop(event, true));
            this.#statePanel.addEventListener("dragover", (event) => this.#externalDrop.onDropZoneDragOver(event, true));
            this.#statePanel.addEventListener("dragleave", (event) => this.#externalDrop.onDropZoneDragLeave(event));
            this.#statePanel.addEventListener("drop", (event) => this.#externalDrop.onDropZoneDrop(event, true));
            this.addEventListener("dragover", (event) => this.#externalDrop.onUnhandledExternalDragOver(event));
            this.addEventListener("drop", (event) => this.#externalDrop.onUnhandledExternalDrop(event));
            this.#statePanel.addEventListener("contextmenu", (event) => this.#fileactionsSettings.onEmptyStateContextMenu(event));
            this.#statePanel.addEventListener("keydown", (event) => this.#fileactionsSettings.onEmptyStateKeyDown(event));
            this.#contextMenu.addEventListener("click", (event) => this.#fileactionsSettings.onContextMenuClick(event));
            this.#contextMenu.addEventListener("keydown", (event) => this.#fileactionsSettings.onContextMenuKeyDown(event));
            this.#contextMenu.addEventListener("submit", (event) => this.#fileactionsSettings.onContextMenuSubmit(event));
            this.#contextMenu.addEventListener("input", () => this.#fileactionsSettings.clearContextMenuError());
            this.#resizeHandle.addEventListener("pointerdown", (event) => this.#startResize(event));
            this.#resizeHandle.addEventListener("keydown", (event) => this.#onResizeKeyDown(event));
        }
        window.addEventListener("resize", this.#onWindowResize);
        window.addEventListener("beforeunload", this.#onBeforeUnload);
        window.addEventListener("pointerdown", this.#onWindowPointerDown, true);
        window.addEventListener("dragend", this.#onWindowDragEnd, true);
        window.addEventListener("keydown", this.#onWindowKeyDown, true);
        this.#forcedColorsQuery ??= window.matchMedia(FORCED_COLORS_QUERY);
        this.#reducedTransparencyQuery ??= window.matchMedia(REDUCED_TRANSPARENCY_QUERY);
        this.#forcedColorsQuery.addEventListener("change", this.#onTransparencyPreferenceChange);
        this.#reducedTransparencyQuery.addEventListener("change", this.#onTransparencyPreferenceChange);
        this.#renderAppearancePlugin();
        this.#themeObserver = new MutationObserver(() => {
            this.#applyTheme();
            if (this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) &&
                !this.#transparentBackgroundPresentation()) {
                this.#scheduleAppearanceHealthCheck(0);
            }
        });
        this.#themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-theme", "style", TRANSPARENT_BACKGROUND_ATTRIBUTE],
        });
        if (document.body)
            this.#themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
        if (typeof ResizeObserver !== "undefined") {
            this.#resizeObserver = new ResizeObserver(() => this.#treeinteractionSettings.renderVisible());
            this.#resizeObserver.observe(this.#treeShell);
        }
    }
    #applyTheme(): void {
        const sources = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
        const explicit = sources.map((source) => source.dataset.theme).find((theme) => theme === "dark" || theme === "light");
        const classDark = sources.some((source) => source.classList.contains("electron-dark") || /(^|\s)dark(\s|$)/i.test(source.className));
        const classLight = sources.some((source) => source.classList.contains("electron-light") || /(^|\s)light(\s|$)/i.test(source.className));
        if (explicit)
            this.dataset.theme = explicit;
        else if (classDark)
            this.dataset.theme = "dark";
        else if (classLight)
            this.dataset.theme = "light";
        else
            delete this.dataset.theme;
        this.#mirrorThemeToMainPreview();
    }
    #mirrorThemeToMainPreview(preview = this.#mainPreview): void {
        if (!preview)
            return;
        const theme = this.dataset.theme;
        if (theme === "dark" || theme === "light")
            preview.dataset.theme = theme;
        else
            delete preview.dataset.theme;
    }
    #onWindowResize = (): void => {
        if (this.#shadow.querySelector(".custom-background-panel:popover-open"))
            return;
        if (this.#shadow.querySelector("#cle-startupTransition-settings")?.matches(":popover-open")) {
            this.#startupSettings.positionStartupTransition();
            return;
        }
        this.#startupSettings.positionStartupTransition();
        this.#blinkingsquaresSettings.positionBlinkingSquares();
        this.#mountainSettings.positionMountain();
        this.#pixelsculptSettings.positionPixelSculpt();
        this.#cloudtrainSettings.positionCloudTrain();
        this.#fileactionsSettings.closeContextMenu(false);
        const marketHasFocus = this.#previewMarketPopover.contains(this.#shadow.activeElement);
        if (!this.#shadow.querySelector("#cle-startupTransition-settings:popover-open, .custom-background-panel:popover-open"))
            this.#closePreviewMarket(marketHasFocus);
        this.#updatesSettings.closeUpdateDialog(false);
        this.#applyResponsivePlacement();
        this.#applySettings();
        this.#treeinteractionSettings.renderVisible();
    };
    #onBeforeUnload = (event: BeforeUnloadEvent): void => {
        if (!this.#previeweditingSettings.isEditDirty())
            return;
        event.preventDefault();
        event.returnValue = "";
    };
    #onWindowPointerDown = (event: PointerEvent): void => {
        if (event.composedPath().includes(this.#actionNotice))
            return;
        if (this.#asciiTilesSettings.containsEvent(event))return;
        if (this.#surfaceOpacity.containsEvent(event))
            return;
        this.#asciiTilesSettings.close();
        this.#surfaceOpacity.close();
        const path = event.composedPath();
        if (!path.includes(this.#required<HTMLElement>("#cle-startupTransition-settings")) && !path.includes(this.#required<HTMLElement>(".startupTransition-settings-trigger")))
            this.#startupSettings.closeStartupTransition();
        if (!path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings")) && !path.includes(this.#required<HTMLElement>(".blinkingSquares-settings-trigger")))
            this.#blinkingsquaresSettings.closeBlinkingSquares();
        if (!path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings")) && !path.includes(this.#required<HTMLElement>(".pixelSculpt-settings-trigger")))
            this.#pixelsculptSettings.closePixelSculpt();
        if (!path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings")) && !path.includes(this.#required<HTMLElement>(".cloudTrain-settings-trigger")))
            this.#cloudtrainSettings.closeCloudTrain();
        if (!path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
            && !path.includes(this.#required<HTMLElement>(".mountain-settings-trigger")))
            this.#mountainSettings.closeMountain();
        if (!this.#contextMenu.hidden && !path.includes(this.#contextMenu))
            this.#fileactionsSettings.closeContextMenu(false);
        if (this.#particleSettings.particleSettingsOpen
            && !path.includes(this.#particleSettingsPanel)
            && !path.includes(this.#particleSettingsTrigger)) {
            this.#particleSettings.closeParticleSettings(false);
        }
        if (this.#blackholeSettings.blackHoleSettingsOpen
            && !path.includes(this.#blackHoleSettingsPanel)
            && !path.includes(this.#blackHoleSettingsTrigger)) {
            this.#blackholeSettings.closeBlackHoleSettings(false);
        }
        if (this.#glowhorizonSettings.glowHorizonSettingsOpen
            && !path.includes(this.#glowHorizonSettingsPanel)
            && !path.includes(this.#glowHorizonSettingsTrigger)) {
            this.#glowhorizonSettings.closeGlowHorizonSettings(false);
        }
        if (this.#heavenlycloudSettings.heavenlyCloudSettingsOpen
            && !path.includes(this.#heavenlyCloudSettingsPanel)
            && !path.includes(this.#heavenlyCloudSettingsTrigger)) {
            this.#heavenlycloudSettings.closeHeavenlyCloudSettings(false);
        }
        if (this.#auroraionosphereSettings.auroraIonosphereSettingsOpen
            && !path.includes(this.#auroraIonosphereSettingsPanel)
            && !path.includes(this.#milkyWaySettingsPanel)
            && !path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings"))
            && !path.includes(this.#auroraIonosphereSettingsTrigger)) {
            this.#auroraionosphereSettings.closeAuroraIonosphereSettings(false);
        }
        if (this.#milkywaySettings.milkyWaySettingsOpen
            && !path.includes(this.#milkyWaySettingsPanel)
            && !path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
            && !path.includes(this.#milkyWaySettingsTrigger)
            && !path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-startupTransition-settings"))
            && !path.includes(this.#shadow.querySelector(".custom-background-panel")!)) {
            this.#milkywaySettings.closeMilkyWaySettings(false);
        }
        if (!this.#previewMarketPopover.hidden
            && !path.includes(this.#previewMarketPopover)
            && !path.includes(this.#previewMarketButton)
            && !path.includes(this.#particleSettingsPanel)
            && !path.includes(this.#blackHoleSettingsPanel)
            && !path.includes(this.#glowHorizonSettingsPanel)
            && !path.includes(this.#heavenlyCloudSettingsPanel)
            && !path.includes(this.#auroraIonosphereSettingsPanel)
            && !path.includes(this.#milkyWaySettingsPanel)
            && !path.includes(this.#required<HTMLElement>("#cle-mountain-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-pixelSculpt-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-cloudTrain-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-blinkingSquares-settings"))
            && !path.includes(this.#required<HTMLElement>("#cle-startupTransition-settings"))
            && !path.includes(this.#shadow.querySelector(".custom-background-panel")!)) {
            this.#closePreviewMarket(false);
        }
        if (this.#updatesSettings.updateDialogOpen
            && !path.includes(this.#updatePopover)
            && !path.includes(this.#statusCode)) {
            this.#updatesSettings.closeUpdateDialog(false);
        }
    };
    #onWindowKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape")
            return;
        if (this.#shadow.querySelector(".custom-background-panel:popover-open")) {
            event.preventDefault();
            event.stopPropagation();
            this.#customBackground?.close();
            this.#shadow.querySelector<HTMLButtonElement>(".custom-background-settings")?.focus();
            return;
        }
        if (this.#particleSettings.particleMorphCurveDragState) {
            event.preventDefault();
            event.stopPropagation();
            this.#particleSettings.cancelParticleMorphCurveInteraction(true);
            return;
        }
        if (event.composedPath().includes(this.#particleMorphCurveEditor)
            && this.#particleSettings.particleMorphCurveFocusSnapshot) {
            event.preventDefault();
            event.stopPropagation();
            this.#particleSettings.particleMorphCurveDraft = cloneParticleMorphCurve(this.#particleSettings.particleMorphCurveFocusSnapshot);
            this.#particleSettings.renderParticleMorphCurveEditor();
            this.#particleSettings.saveParticleMorphCurve(this.#backgroundText("变形曲线已恢复", "Morph curve restored"));
            return;
        }
        const activeValueEditor = event.composedPath().find((target) => (target instanceof HTMLInputElement && target.classList.contains("particle-value-editor")));
        if (activeValueEditor instanceof HTMLInputElement && !activeValueEditor.hidden) {
            const control = [
                ...this.#particleNumericControls.values(),
                ...this.#particleImageTransformControls.values(),
            ].find((candidate) => candidate.editor === activeValueEditor);
            if (control) {
                event.preventDefault();
                event.stopPropagation();
                this.#particleSettings.closeParticleValueEditor(control, true);
                return;
            }
        }
        if (this.#particleSettings.particleSettingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#particleSettings.closeParticleSettings(true);
            return;
        }
        if (this.#blackholeSettings.blackHoleSettingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#blackholeSettings.closeBlackHoleSettings(true);
            return;
        }
        if (this.#glowhorizonSettings.glowHorizonSettingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#glowhorizonSettings.closeGlowHorizonSettings(true);
            return;
        }
        if (this.#heavenlycloudSettings.heavenlyCloudSettingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#heavenlycloudSettings.closeHeavenlyCloudSettings(true);
            return;
        }
        if (this.#auroraionosphereSettings.auroraIonosphereSettingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#auroraionosphereSettings.closeAuroraIonosphereSettings(true);
            return;
        }
        if (this.#milkywaySettings.milkyWaySettingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#milkywaySettings.closeMilkyWaySettings(true);
            return;
        }
        if (this.#githistorySettings.gitHistoryOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#githistorySettings.closeGitHistory(true);
            return;
        }
        if (this.#updatesSettings.updateDialogOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.#updatesSettings.closeUpdateDialog(true);
            return;
        }
        if (!this.#previewMarketOpen)
            return;
        event.preventDefault();
        event.stopPropagation();
        this.#closePreviewMarket(true);
    };
    #onTransparencyPreferenceChange = (): void => {
        this.#renderAppearancePlugin();
        const bridge = this.#workspaceSession.bridge;
        if (!bridge?.available || !this.#connected || this.#dismissed)
            return;
        if (this.#appearanceCoordinator.pluginPending) {
            this.#appearanceSyncQueued = true;
            return;
        }
        void this.#syncPersistedAppearance(bridge, true);
    };
    #onWindowDragEnd = (): void => {
        this.#externalDrop.clearDragState();
    };
    #applyResponsivePlacement(): void {
        if (!this.#homeViewActive)
            return;
        const inlineHidden = this.#inlineParent ? this.#isHidden(this.#inlineParent) : false;
        const drawer = window.innerWidth <= 820 || inlineHidden || this.#requestedPlacement === "drawer";
        this.dataset.placement = drawer ? "drawer" : this.#requestedPlacement;
        if (drawer && this.parentElement !== document.body && document.body) {
            this.#moveHost(document.body, null);
        }
        else if (!drawer && this.#inlineParent?.isConnected && this.parentElement !== this.#inlineParent) {
            const before = this.#inlineNextSibling?.parentNode === this.#inlineParent ? this.#inlineNextSibling : null;
            this.#moveHost(this.#inlineParent, before);
        }
    }
    #rememberInlineMount(): void {
        if (this.#requestedPlacement === "drawer" || !this.parentElement || this.parentElement === document.body)
            return;
        this.#inlineParent = this.parentElement;
        this.#inlineNextSibling = this.nextSibling;
        this.#mountObserver?.disconnect();
        this.#mountObserver = new MutationObserver(() => this.#applyResponsivePlacement());
        this.#mountObserver.observe(this.#inlineParent, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
    }
    #isHidden(element: Element): boolean {
        let current: Element | null = element;
        while (current && current !== document.documentElement) {
            const style = getComputedStyle(current);
            if ((current as HTMLElement).hidden || style.display === "none" || style.visibility === "hidden")
                return true;
            current = current.parentElement;
        }
        return false;
    }
    #moveHost(parent: Element, before: ChildNode | null): void {
        this.#reparenting = true;
        try {
            parent.insertBefore(this, before);
        }
        finally {
            this.#reparenting = false;
        }
    }
    async #switchThread(threadId: string | null, force = false): Promise<void> {
        const diagnostic = beginRuntimeOperation('file-tree', 'workspace switch', { from: runtimeTaskLabel(this.#workspaceSession.threadId), to: runtimeTaskLabel(threadId), force });
        let diagnosticGeneration = this.#workspaceSession.generation;
        try {
            runtimeEvent("renderer", "workspace selection", "requested", { from: runtimeTaskLabel(this.#workspaceSession.threadId), to: runtimeTaskLabel(threadId), hasTask: !!threadId, force, cached: threadId === this.#workspaceSession.threadId && !!this.#workspaceSession.context });
            this.#fileactionsSettings.closeContextMenu(false);
            if (!force && threadId === this.#workspaceSession.threadId && this.#workspaceSession.context) {
                this.#queuedThreadSwitch = undefined;
                diagnostic.finish('cached', { workspacePreserved: true });
                return;
            }
            if (this.#previeweditingSettings.drafts.saving) {
                this.#queuedThreadSwitch = { threadId, force };
                diagnostic.finish('queued', { reason: 'File save in progress' });
                this.#announce("Task switch queued until the current save finishes");
                return;
            }
            if (!this.#previeweditingSettings.leaveEditing("Switch tasks and discard your unsaved changes?")) {
                this.#queuedThreadSwitch = { threadId, force };
                diagnostic.finish('deferred', { reason: 'Unsaved edits retained' });
                return;
            }
            this.#previewWorkspace.purgePreviewTabs(false);
            const selectionChanged = threadId !== this.#workspaceSession.threadId;
            if (selectionChanged) {
                this.#treeinteractionSettings.clearFileFilter(false);
                this.#treeinteractionSettings.clearSelection(false);
                if (this.#treeinteractionSettings.allRowCount > 0)
                    this.#treeinteractionSettings.renderTree();
            }
            this.#githistorySettings.prepareGitHistoryForThreadSwitch();
            const generation = ++this.#workspaceSession.generation;
            diagnosticGeneration = generation;
            this.#clearWorkspaceTimers();
            this.#workspaceSession.threadId = threadId;
            this.#workspaceSession.context = undefined;
            const bridge = this.#workspaceSession.bridge;
            if (!bridge) {
                diagnostic.finish('failed', { errorCode: 'NO_BRIDGE' });
                this.#setState("error", "NO_BRIDGE");
                this.#githistorySettings.showGitHistoryUnavailable("Code-Codex is not connected.");
                return;
            }
            this.#setState("loading");
            try {
                await this.#stopWatch(bridge);
                if (generation !== this.#workspaceSession.generation)
                    return;
                if (!threadId) {
                    await this.#clearNativeContext(bridge);
                    if (generation !== this.#workspaceSession.generation)
                        return;
                    this.#showNoProject();
                    this.#githistorySettings.showGitHistoryUnavailable("Choose a local project to view its Git history.");
                    return;
                }
                const rawContext = await this.#requestBootstrap<unknown>(bridge, generation, "explorer.context", { threadId });
                if (generation !== this.#workspaceSession.generation)
                    return;
                const context = normalizeContext(rawContext, threadId);
                if (!context.compatible) {
                    this.#setState("incompatible", context.reason ?? "This Codex version is not supported.");
                    this.#githistorySettings.showGitHistoryUnavailable("Git history is unavailable for this task.");
                    return;
                }
                this.#workspaceSession.context = context;
                this.#setHeader(context.projectName, context.rootName);
                const rawList = await this.#requestBootstrap<unknown>(bridge, generation, "explorer.list", { relativePath: "", limit: PAGE_SIZE });
                if (generation !== this.#workspaceSession.generation)
                    return;
                const list = normalizeList(rawList);
                this.#treeinteractionSettings.model.reset();
                this.#treeinteractionSettings.model.beginLoad("");
                this.#treeinteractionSettings.model.commitLoad("", list);
                diagnostic.event('root listing', 'applied', { entryCount: list.entries.length, hasNextPage: !!list.nextCursor, generation });
                this.#setState("ready");
                this.#treeinteractionSettings.renderTree();
                if (!this.#previeweditingSettings.restoreDetachedDraft(context))
                    this.#announce(`${context.projectName} loaded`);
                if (this.#githistorySettings.gitHistoryOpen)
                    void this.#githistorySettings.loadGitHistory(true);
                // Show the root before installing a recursive watcher (large projects
                // can take time to subscribe). Re-read after subscription to close the
                // gap between the initial listing and the first watched event.
                try {
                    await bridge.request("explorer.watch.start", {});
                    if (generation !== this.#workspaceSession.generation)
                        return;
                    this.#watching = true;
                }
                catch (error) {
                    recordCaughtRuntimeError("#switchThread", error);
                    if (generation !== this.#workspaceSession.generation)
                        return;
                    this.#watching = false;
                    diagnostic.event('file watcher', 'failed', runtimeErrorDetails(error));
                }
                if (this.#watching)
                    await this.#directoryjobsSettings.loadDirectory("");
            }
            catch (error) {
                recordCaughtRuntimeError("#switchThread", error);
                diagnostic.event('workspace preparation', 'failed', runtimeErrorDetails(error));
                if (generation !== this.#workspaceSession.generation)
                    return;
                if (error instanceof ExplorerBridgeError && error.code === "NO_CONTEXT") {
                    try {
                        await this.#stopWatch(bridge);
                        await this.#clearNativeContext(bridge);
                        if (generation !== this.#workspaceSession.generation)
                            return;
                        this.#showNoProject();
                        this.#githistorySettings.showGitHistoryUnavailable("Choose a local project to view its Git history.");
                    }
                    catch (clearError) {
                        recordCaughtRuntimeError("#switchThread", clearError);
                        if (generation === this.#workspaceSession.generation) {
                            this.#setState("error", errorCode(clearError));
                            this.#githistorySettings.showGitHistoryUnavailable("Git history is unavailable for this task.");
                        }
                    }
                }
                else if (error instanceof ExplorerBridgeError && error.code === "UNSUPPORTED_VERSION") {
                    this.#setState("incompatible", error.message);
                    this.#githistorySettings.showGitHistoryUnavailable("Git history is unavailable for this task.");
                }
                else {
                    this.#setState("error", errorCode(error));
                    this.#githistorySettings.showGitHistoryUnavailable("Git history is unavailable while the project is not loaded.");
                }
            }
        }
        finally {
            diagnostic.finish(diagnosticGeneration !== this.#workspaceSession.generation ? 'discarded' : ['error', 'incompatible'].includes(this.#state) ? 'failed' : 'completed', { state: this.#state, generation: diagnosticGeneration, currentGeneration: this.#workspaceSession.generation, selectionStillCurrent: threadId === this.#workspaceSession.threadId, watching: this.#watching, workspaceAvailable: !!this.#workspaceSession.context });
        }
    }
    async #requestBootstrap<T>(bridge: WorkspaceBridge, generation: number, method: "explorer.context" | "explorer.list", params: Record<string, unknown>): Promise<T> {
        try {
            return await bridge.request<T>(method, params);
        }
        catch (error) {
            recordCaughtRuntimeError("#requestBootstrap", error);
            if (!isTransientBootstrapError(error) || !this.#canRetryBootstrap(bridge, generation))
                throw error;
            runtimeEvent('file-tree', 'bootstrap retry', 'scheduled', { method, generation, delayMs: BOOTSTRAP_RETRY_DELAY_MS, ...runtimeErrorDetails(error) });
            await new Promise<void>((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
            if (!this.#canRetryBootstrap(bridge, generation))
                throw error;
            return bridge.request<T>(method, params);
        }
    }
    #canRetryBootstrap(bridge: WorkspaceBridge, generation: number): boolean {
        return this.#canUseBridge(bridge, generation);
    }
    #canUseBridge(bridge: WorkspaceBridge, generation: number): boolean {
        return this.#connected && !this.#dismissed && this.#workspaceSession.generation === generation && this.#workspaceSession.bridge === bridge;
    }
    #canUseAppearanceBridge(bridge: WorkspaceBridge): boolean {
        return this.#connected && !this.#dismissed && this.#workspaceSession.bridge === bridge;
    }
    async #stopWatch(bridge = this.#workspaceSession.bridge): Promise<void> {
        const wasWatching = this.#watching;
        this.#watching = false;
        if (wasWatching && bridge?.available)
            await bridge.request("explorer.watch.stop", {});
    }
    async #clearNativeContext(bridge: WorkspaceBridge): Promise<void> {
        await bridge.request("explorer.context.clear", {});
    }
    #showNoProject(): void {
        this.#workspaceSession.context = undefined;
        this.#previewWorkspace.purgePreviewTabs(false);
        this.#treeinteractionSettings.model.reset();
        this.#treeinteractionSettings.clearSelection(false);
        this.#treeinteractionSettings.rows = [];
        this.#treeinteractionSettings.allRowCount = 0;
        this.#setHeader("Code-Codex", "No local project detected");
        this.#setState("no-project");
    }
    #refreshLoadedDirectories(): Promise<void> {
        const revision = ++this.#refreshRevision;
        const refresh = this.#refreshCommit
            .catch(() => undefined)
            .then(() => revision === this.#refreshRevision ? this.#directoryjobsSettings.runDirectoryRefresh() : undefined);
        this.#refreshCommit = refresh;
        return refresh;
    }
    #onNotification(method: string, params: unknown): void {
        if (method === "explorer.update.progress") {
            const value = asRecord(params);
            if (!value || !this.#updatesSettings.updateInstallPending || value.latestVersion !== this.#updatesSettings.updateCandidate?.latestVersion)
                return;
            const phase = value?.phase;
            const details = asRecord(value?.details);
            const percent = typeof details?.percent === "number" && Number.isFinite(details.percent) ? ` ${Math.max(0, Math.min(100, Math.floor(details.percent)))}%` : "";
            const messages: Record<string, string> = {
                "checking release": "Checking the update package…",
                "downloading": `Downloading the update${percent}…`,
                "verifying": "Download complete. Verifying the update package…",
                "waiting for installer window": "Package verified. Starting setup and waiting for its window…",
                "installer window shown": "Setup window is now visible. Continue installation there.",
                "installer window unconfirmed": "Setup started, but its window has not been confirmed. Please wait; do not start another update.",
            };
            if (typeof phase === "string" && messages[phase]) {
                this.#showActionProgress(messages[phase]);
                this.#updateMessage.textContent = messages[phase];
                runtimeEvent("renderer", "update progress", "observed", { phase, latestVersion: value.latestVersion, percent: details?.percent });
            }
            return;
        }
        if (method === "explorer.changed") {
            if (!this.#workspaceSession.context || this.#state === "loading")
                return;
            this.#applyChanges(params);
            return;
        }
        if (method === "explorer.context.changed") {
            const object = asRecord(params);
            const threadId = typeof object?.threadId === "string" ? object.threadId : null;
            if (threadId) {
                window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
                    detail: { threadId, hostId: "local", kind: "local" },
                }));
            }
            else
                void this.#switchThread(null);
            return;
        }
        if (method === "explorer.resync") {
            runtimeEvent('file-tree', 'native lifecycle recovery', 'started', { errorCode: 'CC-SESSION-RESYNC-001', readOnlyInitialization: true, writesReplayed: false });
            this.reconnectNative(this.#nativeReconnectMarker ?? getBootstrapConfig(), true);
            return;
        }
        if (method === "explorer.incompatible") {
            const object = asRecord(params);
            this.#setState("incompatible", typeof object?.reason === "string" ? object.reason : "This Codex version is not supported.");
        }
    }
    #applyChanges(params: unknown): void {
        const object = asRecord(params);
        const rawChanges = Array.isArray(params) ? params : Array.isArray(object?.changes) ? object.changes : [params];
        const changes = rawChanges.map(normalizeChange).filter((change): change is ExplorerChange => Boolean(change));
        if (!changes.length)
            return;
        runtimeEvent('file-tree', 'watched changes', 'applied', { count: changes.length, kinds: [...new Set(changes.map(change => change.kind))], loadedDirectoryCount: this.#treeinteractionSettings.model.loadedDirectories().length });
        for (const change of changes) {
            const removedPath = change.kind === "renamed" ? (change.fromRelativePath ?? change.relativePath) : change.relativePath;
            if ((change.kind === "deleted" || change.kind === "renamed") && this.#previeweditingSettings.drafts.path === removedPath) {
                const tab = this.#previewWorkspace.tabStore.items.find((candidate) => candidate.path === removedPath);
                if (tab) {
                    if (this.#previeweditingSettings.drafts.saving)
                        tab.modifiedDuringSave = true;
                    tab.dirty = true;
                }
                this.#previeweditingSettings.drafts.error = "This file was removed or renamed on disk. Your draft is still available.";
                this.#previewWorkspace.syncMainPreview();
            }
            else if (change.kind === "deleted")
                this.#previewWorkspace.closePreviewTab(change.relativePath, false);
            else if (change.kind === "renamed")
                this.#previewWorkspace.closePreviewTab(change.fromRelativePath ?? change.relativePath, false);
            else if (change.kind === "modified")
                this.#previewWorkspace.markPreviewModified(change.relativePath);
            const affectedParents = this.#treeinteractionSettings.model.applyChange(change);
            this.#pendingMarks.set(change.relativePath, change.kind);
            this.#scheduleChangeExpiry(change);
            if (change.kind === "renamed") {
                for (const affectedParent of affectedParents) {
                    if (this.#treeinteractionSettings.model.hasLoaded(affectedParent))
                        this.#scheduleRefresh(affectedParent, 170);
                }
            }
            else if (change.kind === "added" || change.kind === "modified") {
                for (const affectedParent of affectedParents) {
                    if (this.#treeinteractionSettings.model.hasLoaded(affectedParent))
                        this.#scheduleRefresh(affectedParent, 170);
                }
            }
        }
        this.#treeinteractionSettings.renderTree();
        const summary = changes.length === 1 ? `Project entry ${changes[0]?.kind}` : `${changes.length} project entries changed`;
        this.#announce(summary);
    }
    #scheduleChangeExpiry(change: ExplorerChange): void {
        const existing = this.#changeTimers.get(change.relativePath);
        if (existing)
            clearTimeout(existing);
        const delay = change.kind === "deleted" ? 2600 : 4200;
        const timer = setTimeout(() => {
            this.#changeTimers.delete(change.relativePath);
            this.#pendingMarks.delete(change.relativePath);
            this.#treeinteractionSettings.model.clearChange(change.relativePath, change.kind);
            const parent = parentPath(change.relativePath);
            if (this.#treeinteractionSettings.model.hasLoaded(parent))
                this.#scheduleRefresh(parent, 0);
            if (change.fromRelativePath) {
                const oldParent = parentPath(change.fromRelativePath);
                if (this.#treeinteractionSettings.model.hasLoaded(oldParent))
                    this.#scheduleRefresh(oldParent, 0);
            }
            this.#treeinteractionSettings.renderTree();
        }, delay);
        this.#changeTimers.set(change.relativePath, timer);
    }
    #scheduleRefresh(path: string, delay: number): void {
        const existing = this.#refreshTimers.get(path);
        if (existing)
            clearTimeout(existing);
        this.#refreshTimers.set(path, setTimeout(() => {
            this.#refreshTimers.delete(path);
            void this.#directoryjobsSettings.loadDirectory(path);
        }, delay));
    }
    #setState(state: ExplorerViewState, detail = ""): void {
        if (this.#state !== state)
            runtimeEvent("renderer", "file tree state", state, { previous: this.#state, version: window.__codeCodexRuntimeOwner?.version, visible: this.isConnected && !this.hasAttribute('data-home-view-hidden'), bridgeAvailable: this.#workspaceSession.bridge?.available === true });
        if (state !== "ready")
            this.#externalDrop.clearDragState();
        if ((state === "error" || state === "incompatible" || state === "no-project") && this.#previewWorkspace.tabStore.items.length) {
            if (this.#previeweditingSettings.isEditDirty()) {
                this.#previeweditingSettings.drafts.error = "Code-Codex stopped before these changes were saved. Your draft is still available.";
                this.#previewWorkspace.syncMainPreview();
            }
            else {
                this.#previewWorkspace.purgePreviewTabs();
            }
        }
        this.#state = state;
        this.#stateDetail = detail;
        this.dataset.state = state;
        this.dataset.busy = state === "loading" || state === "booting" ? "true" : "false";
        const hasOldTree = this.#treeinteractionSettings.allRowCount > 0;
        const showTree = state === "ready" || (state === "loading" && hasOldTree);
        this.#fileSearchToolbar.hidden = !showTree;
        this.#treeShell.hidden = !showTree;
        this.#treeShell.dataset.switching = state === "loading" ? "true" : "false";
        this.#treeShell.setAttribute("aria-busy", String(state === "loading" || state === "booting"));
        this.#loadingVeil.setAttribute("aria-hidden", state === "loading" && hasOldTree ? "false" : "true");
        this.#statePanel.hidden = showTree;
        this.#statePanel.tabIndex = state === "empty" ? 0 : -1;
        if (!showTree)
            this.#fileFilterEmpty.hidden = true;
        if (!showTree)
            this.#renderStatePanel();
        this.#renderStatus();
    }
    #renderStatePanel(): void {
        const copy = this.#stateCopy();
        this.#statePanel.replaceChildren();
        const mark = document.createElement("div");
        mark.className = "state-mark";
        mark.innerHTML = this.#state === "no-project" || this.#state === "empty" ? icons.folder : icons.warning;
        const title = document.createElement("h3");
        title.className = "state-title";
        title.textContent = copy.title;
        const paragraph = document.createElement("p");
        paragraph.className = "state-copy";
        paragraph.textContent = copy.copy;
        this.#statePanel.append(mark, title, paragraph);
        if (copy.action) {
            const action = document.createElement("button");
            action.type = "button";
            action.className = "state-action";
            action.textContent = copy.action;
            action.addEventListener("click", () => {
                if (this.#state === "incompatible") {
                    void this.disable();
                }
                else if (this.#workspaceSession.threadId)
                    void this.#switchThread(this.#workspaceSession.threadId, true);
            });
            this.#statePanel.append(action);
        }
    }
    #stateCopy(): StateCopy {
        if (this.#state === "booting")
            return { title: "Calibrating explorer", copy: "Connecting the local workspace bridge." };
        if (this.#state === "loading")
            return { title: "Switching project", copy: "Resolving the selected task and its local workspace." };
        if (this.#state === "no-project")
            return { title: "No local project", copy: "The selected task is not bound to a local workspace. Choose a local Codex task to show its files." };
        if (this.#state === "empty")
            return { title: "No visible files", copy: "This project is empty, or all top-level entries are filtered by the workspace rules." };
        if (this.#state === "incompatible")
            return { title: "Version not supported", copy: this.#stateDetail || "Code-Codex stopped safely because this Codex version has not been verified.", action: "Close explorer" };
        const code = this.#stateDetail;
        if (code === "NO_BRIDGE") {
            return { title: "Explorer is not connected", copy: "Restart Codex using the Code-Codex launcher to enable the local bridge." };
        }
        if (code === "ACCESS_DENIED")
            return { title: "Project is unavailable", copy: "Windows denied access to this directory. Check the project permissions, then retry.", action: "Retry" };
        if (code === "NOT_FOUND")
            return { title: "Project moved", copy: "The workspace directory no longer exists at its registered location.", action: "Retry" };
        return { title: "Project could not load", copy: "The local file index did not respond. The Codex interface is unchanged and no files were modified.", action: "Retry" };
    }
    #setHeader(project: string, root: string): void {
        this.#projectName.textContent = project;
        this.#projectName.title = project;
        this.#rootLabel.toggleAttribute("data-i18n-skip", Boolean(this.#workspaceSession.context));
        this.#rootLabel.textContent = root;
        this.#rootLabel.title = root;
        const duplicate = normalizeHeaderLabel(project) === normalizeHeaderLabel(root);
        this.#rootLabel.hidden = duplicate;
        this.#masthead.dataset.rootVisible = String(!duplicate);
    }
    #flushQueuedMainPreviewReconcile(): void {
        const queued = this.#queuedMainPreviewReconcile;
        if (!queued || this.#previeweditingSettings.drafts.saving)
            return;
        this.#queuedMainPreviewReconcile = undefined;
        this.#detachMainPreview();
        this.#mainPreviewSurface = queued.surface;
        if (queued.surface && this.#previewWorkspace.tabStore.items.length) {
            this.#ensureMainPreview();
            this.#previewWorkspace.syncMainPreview();
        }
    }
    #flushQueuedThreadSwitch(): void {
        const queued = this.#queuedThreadSwitch;
        if (!queued || this.#previeweditingSettings.drafts.saving)
            return;
        this.#queuedThreadSwitch = undefined;
        queueMicrotask(() => {
            if (this.#connected && !this.#dismissed)
                void this.#switchThread(queued.threadId, queued.force);
        });
    }
    #flushQueuedNativeReconnect(): boolean {
        const queued = this.#queuedNativeReconnect;
        if (!queued || this.#previeweditingSettings.drafts.saving || this.#previeweditingSettings.isEditDirty())
            return false;
        this.#queuedNativeReconnect = undefined;
        queueMicrotask(() => {
            if (this.#connected && !this.#dismissed)
                this.reconnectNative(queued);
        });
        return true;
    }
    #ensureMainPreview(): CodeCodexMainPreviewElement | undefined {
        const surface = this.#mainPreviewSurface;
        if (!this.#homeViewActive || !surface?.isConnected || this.#dismissed)
            return undefined;
        const qualifiedSurfaces = activePageElements(document, MAIN_SURFACE_SELECTOR);
        if (qualifiedSurfaces.length !== 1 || qualifiedSurfaces[0] !== surface)
            return undefined;
        if (this.#mainPreview) {
            this.#mainPreview.reparent(surface);
            this.#mainPreview.setSuspended(false);
            return this.#mainPreview;
        }
        this.#detachMainPreview(false);
        registerMainPreviewElement();
        const preview = document.createElement(MAIN_PREVIEW_TAG) as CodeCodexMainPreviewElement;
        preview.dataset.codeCodexOwned = "true";
        this.#mirrorThemeToMainPreview(preview);
        preview.addEventListener("cle-main-preview-activate", this.#onMainPreviewActivate as EventListener);
        preview.addEventListener("cle-main-preview-close", this.#onMainPreviewClose as EventListener);
        preview.addEventListener("cle-main-preview-draft", this.#onMainPreviewDraft as EventListener);
        preview.addEventListener("cle-main-preview-save", this.#onMainPreviewSave as EventListener);
        preview.addEventListener("cle-main-preview-reload", this.#onMainPreviewReload as EventListener);
        surface.append(preview);
        this.#mainPreview = preview;
        return preview;
    }
    #detachMainPreview(forgetSurface = true): void {
        const preview = this.#mainPreview;
        this.#mainPreview = undefined;
        if (forgetSurface)
            this.#mainPreviewSurface = undefined;
        if (!preview)
            return;
        preview.removeEventListener("cle-main-preview-activate", this.#onMainPreviewActivate as EventListener);
        preview.removeEventListener("cle-main-preview-close", this.#onMainPreviewClose as EventListener);
        preview.removeEventListener("cle-main-preview-draft", this.#onMainPreviewDraft as EventListener);
        preview.removeEventListener("cle-main-preview-save", this.#onMainPreviewSave as EventListener);
        preview.removeEventListener("cle-main-preview-reload", this.#onMainPreviewReload as EventListener);
        preview.setState({ activePath: null, tabs: [] });
        preview.remove();
    }
    #onMainPreviewActivate = (event: CustomEvent<unknown>): void => {
        const detail = asRecord(event.detail);
        if (detail?.kind === "conversation") {
            if (!this.#previeweditingSettings.leaveEditing("Return to the conversation and discard your unsaved changes?")) {
                event.preventDefault();
                this.#previewWorkspace.syncMainPreview();
                return;
            }
            this.#activePreviewPath = null;
            this.#previewWorkspace.syncMainPreview();
            this.#treeinteractionSettings.renderVisible();
            this.#announce("Conversation shown");
            return;
        }
        if (detail?.kind !== "file" || typeof detail.path !== "string")
            return;
        const tab = this.#previewWorkspace.tabStore.items.find((candidate) => candidate.path === detail.path);
        if (!tab)
            return;
        if (this.#activePreviewPath === tab.path)
            return;
        if (this.#previeweditingSettings.drafts.path !== null &&
            this.#previeweditingSettings.drafts.path !== tab.path &&
            !this.#previeweditingSettings.leaveEditing("Switch files and discard your unsaved changes?")) {
            event.preventDefault();
            this.#previewWorkspace.syncMainPreview();
            return;
        }
        this.#activePreviewPath = tab.path;
        if (tab.dirty || tab.view.kind === "error")
            this.#previewWorkspace.schedulePreview(tab);
        else
            this.#previewWorkspace.syncMainPreview();
        this.#treeinteractionSettings.renderVisible();
    };
    #onMainPreviewClose = (event: CustomEvent<unknown>): void => {
        const detail = asRecord(event.detail);
        if (typeof detail?.path === "string")
            this.#previewWorkspace.closePreviewTab(detail.path);
    };
    #onMainPreviewDraft = (event: CustomEvent<unknown>): void => {
        if (event.target !== this.#mainPreview)
            return;
        const detail = asRecord(event.detail);
        if (detail?.path !== this.#previeweditingSettings.drafts.path || typeof detail.text !== "string")
            return;
        this.#previeweditingSettings.drafts.text = detail.text;
        this.#previeweditingSettings.drafts.revision += 1;
        this.#previeweditingSettings.syncEditModeButton();
    };
    #onMainPreviewSave = (event: CustomEvent<unknown>): void => {
        if (event.target !== this.#mainPreview)
            return;
        const detail = asRecord(event.detail);
        if (detail?.path === this.#previeweditingSettings.drafts.path)
            void this.#previeweditingSettings.saveEditing(false);
    };
    #onMainPreviewReload = (event: CustomEvent<unknown>): void => {
        if (event.target !== this.#mainPreview)
            return;
        const detail = asRecord(event.detail);
        if (detail?.path === this.#previeweditingSettings.drafts.path)
            this.#previeweditingSettings.reloadEditedFile();
    };
    #startResize(event: PointerEvent): void {
        if (event.button !== 0)
            return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = this.#settings.width;
        this.#resizeHandle.dataset.resizing = "true";
        const cursor = document.documentElement.style.cursor;
        const userSelect = document.documentElement.style.userSelect;
        document.documentElement.style.cursor = "ew-resize";
        document.documentElement.style.userSelect = "none";
        const move = (moveEvent: PointerEvent) => {
            this.#settings = { ...this.#settings, width: this.#clampWidth(startWidth + moveEvent.clientX - startX) };
            this.#applySettings();
        };
        const finish = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            delete this.#resizeHandle.dataset.resizing;
            document.documentElement.style.cursor = cursor;
            document.documentElement.style.userSelect = userSelect;
            this.#persistSettings();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish, { once: true });
        window.addEventListener("pointercancel", finish, { once: true });
    }
    #onResizeKeyDown(event: KeyboardEvent): void {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
            return;
        event.preventDefault();
        const amount = event.shiftKey ? 40 : 10;
        this.#settings = { ...this.#settings, width: this.#clampWidth(this.#settings.width + (event.key === "ArrowRight" ? amount : -amount)) };
        this.#applySettings();
        this.#persistSettings();
    }
    #clampWidth(width: number): number {
        return Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
    }
    #effectiveWidth(): number {
        const viewportLimit = Math.max(1, Math.floor(window.innerWidth * 0.84));
        return Math.min(this.#settings.width, viewportLimit);
    }
    #readEnabledPreviewers(): readonly string[] {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(PREVIEWER_SETTINGS_KEY) || "[]");
            if (!Array.isArray(value))
                return [];
            return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && PREVIEWER_IDS.has(entry)))];
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#readEnabledPreviewers", __codeCodexCaught);
            return [];
        }
    }
    #writeEnabledPreviewers(): void {
        try {
            localStorage.setItem(PREVIEWER_SETTINGS_KEY, JSON.stringify([...this.#enabledPreviewers]));
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#writeEnabledPreviewers", __codeCodexCaught);
            // Preview extensions remain enabled for this session when DOM storage is unavailable.
        }
    }
    #isCurrentBackgroundInitialization(generation: number): boolean {
        return this.#connected && generation === this.#appearanceInitializationGeneration;
    }
    async #awaitBackgroundInitializations(operation: number): Promise<boolean> {
        const generation = this.#appearanceInitializationGeneration;
        this.#particleBackgroundInitialization ??= this.#particleSettings.initializeParticleBackground(generation);
        await this.#particleBackgroundInitialization;
        if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceCoordinator.operation)
            return false;
        this.#blackHoleBackgroundInitialization ??= this.#particleBackgroundInitialization
            .then(() => this.#blackholeSettings.initializeBlackHoleBackground(generation));
        await this.#blackHoleBackgroundInitialization;
        if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceCoordinator.operation)
            return false;
        this.#glowHorizonBackgroundInitialization ??= this.#blackHoleBackgroundInitialization
            .then(() => this.#glowhorizonSettings.initializeGlowHorizonBackground(generation));
        await this.#glowHorizonBackgroundInitialization;
        if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceCoordinator.operation)
            return false;
        this.#heavenlyCloudBackgroundInitialization ??= this.#glowHorizonBackgroundInitialization
            .then(() => this.#heavenlycloudSettings.initializeHeavenlyCloudBackground(generation));
        await this.#heavenlyCloudBackgroundInitialization;
        if (!this.#isCurrentBackgroundInitialization(generation) || operation !== this.#appearanceCoordinator.operation)
            return false;
        this.#auroraIonosphereBackgroundInitialization ??= this.#heavenlyCloudBackgroundInitialization
            .then(() => this.#auroraionosphereSettings.initializeAuroraIonosphereBackground(generation));
        await this.#auroraIonosphereBackgroundInitialization;
        this.#milkyWayBackgroundInitialization ??= this.#auroraIonosphereBackgroundInitialization.then(() => this.#milkywaySettings.initializeMilkyWayBackground(generation));
        await this.#milkyWayBackgroundInitialization;
        await this.#mountainInitialization;
        await this.#cloudTrainInitialization;
        await this.#pixelSculptInitialization;
        await this.#blinkingSquaresInitialization;
        await this.#asciiTilesInitialization;
        return this.#isCurrentBackgroundInitialization(generation) && operation === this.#appearanceCoordinator.operation;
    }
    #readEnabledAppearancePlugins(): readonly string[] {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(APPEARANCE_PLUGIN_SETTINGS_KEY) || "[]");
            if (!Array.isArray(value))
                return [];
            return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && APPEARANCE_PLUGIN_IDS.has(entry)))];
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#readEnabledAppearancePlugins", __codeCodexCaught);
            return [];
        }
    }
    #writeEnabledAppearancePlugins(): void {
        // Hand off only after a real background has committed. A click, cold
        // load or rejected native transition must leave Custom's media alive.
        if ([...this.#enabledAppearancePlugins].some(id => APPEARANCE_PLUGIN_IDS.has(id)))
            window.dispatchEvent(new Event('code-codex:custom-background-stop'));
        runtimeEvent("renderer", "appearance plugins", "active set updated", { plugins: [...this.#enabledAppearancePlugins] });
        try {
            localStorage.setItem(APPEARANCE_PLUGIN_SETTINGS_KEY, JSON.stringify([...this.#enabledAppearancePlugins]));
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#writeEnabledAppearancePlugins", __codeCodexCaught);
            // Appearance plugins remain enabled for this session when DOM storage is unavailable.
        }
    }
    #transparencyPreferenceBlocked(): boolean {
        return this.#forcedColorsQuery?.matches === true || this.#reducedTransparencyQuery?.matches === true;
    }
    #transparentBackgroundPresentation(): string | undefined { return transparentPresentation(); }
    #applyTransparentBackgroundPresentation(background: string): void { applyTransparentPresentation(background); }
    #clearTransparentBackgroundPresentation(): void { clearTransparentPresentation(); }
    #cancelAppearanceHealthCheck(): void {
        if (this.#appearanceHealthTimer !== undefined)
            clearTimeout(this.#appearanceHealthTimer);
        this.#appearanceHealthTimer = undefined;
    }
    #scheduleAppearanceHealthCheck(delay = TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS): void {
        if (this.#appearanceHealthTimer !== undefined ||
            !this.#connected ||
            this.#dismissed ||
            this.#appearanceCoordinator.transitionPending ||
            !this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) ||
            this.#transparencyPreferenceBlocked()) {
            return;
        }
        this.#appearanceHealthTimer = setTimeout(() => {
            this.#appearanceHealthTimer = undefined;
            void this.#runAppearanceHealthCheck();
        }, Math.max(0, delay));
    }
    async #runAppearanceHealthCheck(): Promise<void> {
        if (this.#appearanceHealthPending ||
            this.#appearanceCoordinator.pluginPending ||
            this.#appearanceCoordinator.transitionPending ||
            !this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) ||
            this.#transparencyPreferenceBlocked()) {
            this.#scheduleAppearanceHealthCheck(250);
            return;
        }
        const bridge = this.#workspaceSession.bridge;
        if (!bridge?.available || !this.#canUseAppearanceBridge(bridge))
            return;
        this.#appearanceHealthPending = true;
        const operation = this.#appearanceCoordinator.operation;
        let retryDelay = TRANSPARENT_BACKGROUND_HEALTH_INTERVAL_MS;
        try {
            const result = await this.#setWindowTransparency(bridge, true);
            if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
                await this.#reconcilePersistedWindowTransparency();
                return;
            }
            this.#applyTransparentBackgroundPresentation(result.background);
            this.#nativeWindowBackground.applied = true;
            this.#nativeWindowBackground.error = undefined;
        }
        catch (error) {
            recordCaughtRuntimeError("#runAppearanceHealthCheck", error);
            retryDelay = 500;
            if (!this.#isCurrentAppearanceOperation(bridge, operation))
                return;
            this.#clearTransparentBackgroundPresentation();
            this.#nativeWindowBackground.applied = false;
            this.#nativeWindowBackground.error = transparencyActionError(error, true);
        }
        finally {
            this.#appearanceHealthPending = false;
            if (this.#isCurrentAppearanceOperation(bridge, operation)) {
                this.#renderAppearancePlugin();
                this.#scheduleAppearanceHealthCheck(retryDelay);
            }
        }
    }
    async #toggleTransparentBackground():Promise<void>{await this.#backgroundActions.toggle(TRANSPARENT_BACKGROUND_PLUGIN_ID);}

    async #syncPersistedAppearance(bridge: WorkspaceBridge, reportErrors: boolean): Promise<void> {
        if (!this.#canUseAppearanceBridge(bridge))
            return;
        if (this.#appearanceCoordinator.pluginPending || this.#appearanceCoordinator.transitionPending) {
            this.#appearanceSyncQueued = true;
            return;
        }
        const persistedEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        const requestedEnabled = persistedEnabled && !this.#transparencyPreferenceBlocked();
        const operation = ++this.#appearanceCoordinator.operation;
        if (!requestedEnabled)
            this.#cancelAppearanceHealthCheck();
        this.#appearanceCoordinator.pluginPending = true;
        this.#nativeWindowBackground.error = undefined;
        this.#renderPreviewMarket();
        const previousBackground = this.#transparentBackgroundPresentation();
        this.#clearTransparentBackgroundPresentation();
        try {
            const result = await this.#setWindowTransparency(bridge, requestedEnabled);
            if (!this.#isCurrentAppearanceOperation(bridge, operation)) {
                await this.#reconcilePersistedWindowTransparency();
                return;
            }
            if (requestedEnabled)
                this.#applyTransparentBackgroundPresentation(result.background);
            this.#nativeWindowBackground.applied = requestedEnabled;
        }
        catch (error) {
            recordCaughtRuntimeError("#syncPersistedAppearance", error);
            if (!this.#isCurrentAppearanceOperation(bridge, operation))
                return;
            if (!requestedEnabled
                && previousBackground
                && !this.#enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID)
                && !this.#enabledAppearancePlugins.has(BLACK_HOLE_BACKGROUND_PLUGIN_ID)
                && !this.#enabledAppearancePlugins.has(GLOW_HORIZON_BACKGROUND_PLUGIN_ID)
                && !this.#enabledAppearancePlugins.has(HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID)
                && !this.#enabledAppearancePlugins.has(AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID)
                && !this.#enabledAppearancePlugins.has(MILKY_WAY_BACKGROUND_PLUGIN_ID)) {
                this.#applyTransparentBackgroundPresentation(previousBackground);
            }
            if (requestedEnabled)
                this.#nativeWindowBackground.applied = false;
            this.#nativeWindowBackground.error = transparencyActionError(error, requestedEnabled);
            if (reportErrors)
                this.#showActionNotice(this.#nativeWindowBackground.error, "error");
        }
        finally {
            if (this.#isCurrentAppearanceOperation(bridge, operation)) {
                this.#appearanceCoordinator.pluginPending = false;
                this.#renderPreviewMarket();
                this.#flushQueuedAppearanceSync(bridge);
                if (requestedEnabled)
                    this.#scheduleAppearanceHealthCheck();
            }
        }
    }
    async #reconcilePersistedWindowTransparency(): Promise<void> {
        const bridge = this.#workspaceSession.bridge;
        if (!bridge?.available)
            return;
        const requestedEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID)
            && !this.#transparencyPreferenceBlocked();
        try {
            const result = await this.#setWindowTransparency(bridge, requestedEnabled);
            if (this.#workspaceSession.bridge !== bridge)
                return;
            if (requestedEnabled)
                this.#applyTransparentBackgroundPresentation(result.background);
            else
                this.#clearTransparentBackgroundPresentation();
            this.#nativeWindowBackground.applied = requestedEnabled;
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#reconcilePersistedWindowTransparency", __codeCodexCaught);
            // The next bridge synchronization retries the persisted preference.
        }
    }
    async #setWindowTransparency(bridge: WorkspaceBridge, enabled: boolean): Promise<WindowTransparencyResult> {
        const previous = this.#appearanceRpcTail;
        let release: (() => void) | undefined;
        this.#appearanceRpcTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            const raw = await bridge.request<unknown>("explorer.window.transparency.set", { enabled });
            return validateTransparencyResult(raw, enabled);
        }
        finally {
            release?.();
        }
    }
    #isCurrentAppearanceOperation(bridge: WorkspaceBridge, operation: number): boolean {
        return this.#appearanceCoordinator.operation === operation && this.#canUseAppearanceBridge(bridge);
    }
    #flushQueuedAppearanceSync(bridge: WorkspaceBridge): void {
        if (!this.#appearanceSyncQueued)
            return;
        this.#appearanceSyncQueued = false;
        void this.#syncPersistedAppearance(bridge, true);
    }
    #togglePreviewMarket(): void {
        if (this.#previewMarketOpen) {
            this.#closePreviewMarket(true);
            return;
        }
        this.#fileactionsSettings.closeContextMenu(false);
        this.#updatesSettings.closeUpdateDialog(false);
        this.#previewMarketOpen = true;
        this.#previewMarketPopover.hidden = false;
        this.#previewMarketButton.setAttribute("aria-expanded", "true");
        this.#renderPreviewMarket();
        this.#selectPreviewMarketCategory("appearance", false);
        queueMicrotask(() => {
            if (this.#previewMarketOpen)
                this.#previewMarketCloseButton.focus();
        });
    }
    #selectPreviewMarketCategory(category: PreviewMarketCategory, focus = true): void {
        this.#previewMarketList.dataset.previewMarketCategory = category;
        for (const button of this.#previewMarketList.querySelectorAll<HTMLButtonElement>("button[data-preview-market-category]")) {
            const selected = button.dataset.previewMarketCategory === category;
            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
            if (selected && focus)
                button.focus();
        }
        for (const section of this.#previewMarketList.querySelectorAll<HTMLElement>("[data-preview-market-section]")) {
            section.hidden = section.dataset.previewMarketSection !== category;
        }
        this.#previewMarketList.scrollTop = 0;
        if (category !== "appearance") {
            this.#asciiTilesSettings.close();
            this.#blinkingsquaresSettings.closeBlinkingSquares();
            this.#pixelsculptSettings.closePixelSculpt();
            this.#cloudtrainSettings.closeCloudTrain();
            this.#mountainSettings.closeMountain();
            this.#milkywaySettings.closeMilkyWaySettings(false);
            this.#particleSettings.closeParticleSettings(false);
            this.#blackholeSettings.closeBlackHoleSettings(false);
            this.#glowhorizonSettings.closeGlowHorizonSettings(false);
            this.#heavenlycloudSettings.closeHeavenlyCloudSettings(false);
            this.#auroraionosphereSettings.closeAuroraIonosphereSettings(false);
        }
        this.#revealEnabledPreviewMarketCard(category);
    }
    #revealEnabledPreviewMarketCard(category: PreviewMarketCategory): void {
        if (!this.#previewMarketOpen)
            return;
        const section = this.#previewMarketList.querySelector<HTMLElement>(`[data-preview-market-section="${category}"]`);
        if (!section || section.hidden)
            return;
        const card = Array.from(section.querySelectorAll<HTMLElement>(".preview-extension:not([hidden])"))
            .find((candidate) => {
            const action = candidate.querySelector<HTMLButtonElement>(".preview-extension-action");
            return action?.getAttribute("aria-pressed") === "true" || action?.dataset.enabled === "true";
        });
        if (!card)
            return;
        const list = this.#previewMarketList;
        const top = list.scrollTop + card.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
        list.scrollTop = Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
    }
    #closePreviewMarket(restoreFocus: boolean): void {
        this.#customBackground?.close();
        this.#asciiTilesSettings.close();
        this.#surfaceOpacity.close();
        this.#startupSettings.closeStartupTransition();
        this.#blinkingsquaresSettings.closeBlinkingSquares();
        this.#pixelsculptSettings.closePixelSculpt();
        this.#cloudtrainSettings.closeCloudTrain();
        this.#mountainSettings.closeMountain();
        this.#milkywaySettings.closeMilkyWaySettings(false);
        this.#particleSettings.closeParticleSettings(false);
        this.#blackholeSettings.closeBlackHoleSettings(false);
        this.#glowhorizonSettings.closeGlowHorizonSettings(false);
        this.#heavenlycloudSettings.closeHeavenlyCloudSettings(false);
        this.#auroraionosphereSettings.closeAuroraIonosphereSettings(false);
        if (!this.#previewMarketOpen && this.#previewMarketPopover.hidden)
            return;
        this.#previewMarketOpen = false;
        this.#previewMarketPopover.hidden = true;
        this.#previewMarketButton.setAttribute("aria-expanded", "false");
        if (restoreFocus && this.#previewMarketButton.isConnected)
            this.#previewMarketButton.focus();
    }
    #togglePreviewer(previewer: PreviewerDefinition): void {
        const wasEnabled = this.#enabledPreviewers.has(previewer.id);
        if (wasEnabled)
            this.#enabledPreviewers.delete(previewer.id);
        else
            this.#enabledPreviewers.add(previewer.id);
        this.#writeEnabledPreviewers();
        this.#renderPreviewMarket();
        if (previewer.kind === "markdown" || previewer.kind === "csv" || previewer.kind === "diagram") {
            this.#previewWorkspace.syncMainPreview();
        }
        else {
            this.#applyMediaPreviewerToggle(previewer.id, !wasEnabled);
        }
        this.#announce(`${previewer.title} ${wasEnabled ? "disabled" : "enabled"}`);
    }
    #prepareDownloadedPluginAction(id: string, intent: 'enable' | 'settings'): void {
        if (intent !== 'enable')
            return;
        if (id.endsWith('-preview'))
            this.#enabledPreviewers.delete(`code-codex.${id}`);
        else if (id !== 'surface-opacity' && id !== 'codex-startup-transition' && id !== 'git-history') {
            this.#enabledAppearancePlugins.delete(id === 'transparent-background' ? 'code-codex.transparent-background' : `code-codex.${id === 'mountain' ? 'layered-mountain' : id}-background`);
        }
    }
    #backgroundPackageMarket: BackgroundPackageMarket | undefined;
    #connectPackageMarket(bridge: WorkspaceBridge): void {
        connectBackgroundPackages((method, params, timeout) => bridge.request(method, params, timeout));
        this.#backgroundPackageMarket?.dispose();
        this.#backgroundPackageMarket = new BackgroundPackageMarket(this.#shadow, bridge, message => this.#showActionNotice(message, 'error'), async (id, intent) => {
            this.#prepareDownloadedPluginAction(id, intent);
            if (id === 'custom-background')
                await this.#prepareCustomBackground();
        });
        this.#installCustomBackground();
    }
    #customBackground: CustomBackground | undefined;
    #customBackgroundLoading: Promise<void> | undefined;
    #prepareCustomBackground: () => Promise<void> = () => Promise.resolve();
    #customBackgroundClick: ((event: Event) => void) | undefined;
    #installCustomBackground(): void {
        if (!this.#shadow.querySelector('.custom-background-panel')) {
            const panel = document.createElement('section');
            panel.className = 'particle-settings-panel startupTransition-settings-panel custom-background-panel';
            panel.id = 'cle-custom-background-settings';
            panel.setAttribute('popover', 'manual');
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'false');
            panel.setAttribute('aria-label', 'Custom Background');
            panel.hidden = true;
            panel.dataset.language = parameterLanguage();
            this.#shadow.append(panel);
        }
        this.#prepareCustomBackground = () => this.#customBackgroundLoading ??= ensureBackgroundPackage('custom-background').then(() => {
            if (!this.#connected)
                return;
            if (this.#customBackground)
                return this.#customBackground.ready;
            const Constructor = requireConstructor<typeof CustomBackground>('custom-background','CustomBackground',backgroundModule('custom-background').exports.CustomBackground);
            this.#customBackground = new Constructor(this.#shadow, async () => {
                const lease = this.#appearanceCoordinator.acquire();
                if (!lease) throw new Error('Another background transition is in progress. Retry after it completes.');
                try {
                const transparentWasEnabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID) || document.documentElement.hasAttribute(TRANSPARENT_BACKGROUND_ATTRIBUTE);
                for (const controller of [this.#asciiTilesRuntime,this.#particleBackgroundController, this.#blackHoleBackgroundController, this.#glowHorizonBackgroundController, this.#heavenlyCloudBackgroundController, this.#auroraIonosphereBackgroundController, this.#milkyWayBackgroundController, this.#mountainController, this.#pixelSculptController, this.#blinkingSquaresController, this.#cloudTrainController])
                    if (controller.enabled) {
                        await controller.disable(true);
                        lease.assertCurrent();
                    }
                lease.assertCurrent();
                for (const id of [...this.#enabledAppearancePlugins])
                    if (id !== 'code-codex.surface-opacity')
                        this.#enabledAppearancePlugins.delete(id);
                if (transparentWasEnabled && this.#workspaceSession.bridge?.available)
                    await this.#setWindowTransparency(this.#workspaceSession.bridge, false);
                lease.assertCurrent();
                this.#clearTransparentBackgroundPresentation();
                this.#writeEnabledAppearancePlugins();
                } finally {
                    lease.release();
                    this.#renderPreviewMarket();
                }
            }, (code, error) => runtimeEvent('custom-background', 'operation', 'failed', { errorCode: code, ...runtimeErrorDetails(error) }));
            return this.#customBackground.ready;
        }).finally(() => { this.#customBackgroundLoading = undefined; });
        if (this.#customBackgroundClick)
            this.#shadow.removeEventListener('click', this.#customBackgroundClick, true);
        this.#customBackgroundClick = event => {
            const button = (event.target as Element)?.closest('button');
            // The package coordinator exclusively owns cold Download/Cancel. This
            // adapter only initializes an already verified runtime on a fresh host.
            if (button?.matches('.custom-background-enable,.custom-background-settings') && !this.#customBackground && isPluginPackageLoaded('custom-background')) {
                event.stopImmediatePropagation();
                void this.#prepareCustomBackground().then(() => { if (this.#connected && button.isConnected)
                    (button as HTMLButtonElement).click(); }).catch(e => this.#showActionNotice(String(e), 'error'));
            }
        };
        this.#shadow.addEventListener('click', this.#customBackgroundClick, true);
        try {
            if (JSON.parse(localStorage.getItem('code-codex:custom-background:v1') ?? '{}').enabled && !this.#customBackground)
                void this.#prepareCustomBackground().catch(e => this.#showActionNotice(String(e), 'error'));
        }
        catch (e) {
            recordCaughtRuntimeError('custom background restore', e);
        }
    }
    #renderPreviewMarket(): void {
        this.#asciiTilesSettings.render();
        this.#surfaceOpacity.render();
        this.#startupSettings.renderStartupTransition();
        this.#blinkingsquaresSettings.renderBlinkingSquares();
        this.#pixelsculptSettings.renderPixelSculpt();
        this.#cloudtrainSettings.renderCloudTrain();
        this.#mountainSettings.renderMountain();
        this.#renderAppearancePlugin();
        this.#particleSettings.renderParticleBackgroundPlugin();
        this.#blackholeSettings.renderBlackHoleBackgroundPlugin();
        this.#glowhorizonSettings.renderGlowHorizonBackgroundPlugin();
        this.#heavenlycloudSettings.renderHeavenlyCloudBackgroundPlugin();
        this.#auroraionosphereSettings.renderAuroraIonosphereBackgroundPlugin();
        this.#milkywaySettings.renderMilkyWayBackgroundPlugin();
        for (const previewer of PREVIEWER_DEFINITIONS) {
            const enabled = this.#enabledPreviewers.has(previewer.id);
            const status = this.#previewerStatuses.get(previewer.id);
            const button = this.#previewerButtons.get(previewer.id);
            if (!status || !button)
                continue;
            status.textContent = enabled ? "Enabled" : "Disabled";
            status.dataset.enabled = String(enabled);
            button.textContent = enabled ? "Disable" : "Enable";
            button.dataset.enabled = String(enabled);
            button.setAttribute("aria-pressed", String(enabled));
            button.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${previewer.title}`);
        }
        this.#backgroundPackageMarket?.render();
    }
    #renderAppearancePlugin(): void {
        this.#backgroundPackageMarket?.queueRender();
        const enabled = this.#enabledAppearancePlugins.has(TRANSPARENT_BACKGROUND_PLUGIN_ID);
        const bridgeAvailable = this.#workspaceSession.bridge?.available === true;
        const preferenceBlocked = this.#transparencyPreferenceBlocked();
        const presentationApplied = this.#transparentBackgroundPresentation() !== undefined;
        const active = enabled && this.#nativeWindowBackground.applied === true && presentationApplied && !preferenceBlocked;
        let status = enabled ? "Enabled" : "Disabled";
        if (enabled && preferenceBlocked)
            status = "Enabled · Paused";
        else if (enabled && !active)
            status = "Enabled · Not applied";
        else if (!enabled && this.#nativeWindowBackground.applied === undefined)
            status = "Disabled · Not verified";
        this.#transparentBackgroundStatus.textContent = status;
        this.#transparentBackgroundStatus.dataset.enabled = String(active);
        this.#transparentBackgroundStatus.dataset.pending = String(this.#appearanceCoordinator.pluginPending);
        this.#transparentBackgroundCard.setAttribute("aria-busy", String(this.#appearanceCoordinator.pluginPending));
        this.#transparentBackgroundButton.textContent = this.#appearanceCoordinator.pluginPending ? "Applying…" : enabled ? "Disable" : "Enable";
        this.#transparentBackgroundButton.dataset.enabled = String(enabled);
        this.#transparentBackgroundButton.setAttribute("aria-pressed", String(enabled));
        this.#transparentBackgroundButton.setAttribute("aria-label", this.#appearanceCoordinator.pluginPending
            ? "Applying Transparent Background"
            : `${enabled ? "Disable" : "Enable"} Transparent Background`);
        this.#transparentBackgroundButton.disabled =
            this.#appearanceCoordinator.pluginPending
                || this.#appearanceCoordinator.transitionPending
                || this.#particleBackgroundController.pending
                || this.#blackHoleBackgroundController.pending
                || this.#glowHorizonBackgroundController.pending
                || this.#heavenlyCloudBackgroundController.pending
                || this.#asciiTilesRuntime.pending
                || this.#auroraIonosphereBackgroundController.pending
                || this.#milkyWayBackgroundController.pending
                || !bridgeAvailable
                || (!enabled && preferenceBlocked);
        let title = "";
        if (!bridgeAvailable)
            title = "Restart Codex with Code-Codex to change this extension.";
        else if (!enabled && preferenceBlocked)
            title = "Turn off high contrast or reduced transparency to enable this extension.";
        else if (this.#nativeWindowBackground.error)
            title = this.#nativeWindowBackground.error;
        if (title)
            this.#transparentBackgroundButton.title = title;
        else
            this.#transparentBackgroundButton.removeAttribute("title");
    }
    #applyMediaPreviewerToggle(previewerId: string, enabled: boolean): void {
        let activeReload: PreviewTab | undefined;
        for (const tab of this.#previewWorkspace.tabStore.items) {
            if (mediaPreviewRoute(tab.path)?.previewerId !== previewerId)
                continue;
            if (tab.timer)
                clearTimeout(tab.timer);
            tab.timer = undefined;
            tab.revision += 1;
            tab.dirty = enabled;
            tab.view = enabled
                ? { kind: "loading", path: tab.path, name: tab.name }
                : { kind: "unsupported", path: tab.path, name: tab.name, sizeBytes: 0, reason: "previewer-disabled" };
            if (enabled && tab.path === this.#activePreviewPath)
                activeReload = tab;
        }
        if (activeReload)
            this.#previewWorkspace.schedulePreview(activeReload, 0);
        else
            this.#previewWorkspace.syncMainPreview();
    }
    #readLocalSettings(): ExplorerSettings {
        try {
            return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"));
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#readLocalSettings", __codeCodexCaught);
            return { ...DEFAULT_SETTINGS };
        }
    }
    async #loadNativeSettings(bridge: WorkspaceBridge, generation: number): Promise<void> {
        try {
            const raw = await bridge.request<unknown>("explorer.settings.get", {});
            if (!raw || !this.#canUseBridge(bridge, generation))
                return;
            this.#settings = normalizeSettings(asRecord(raw)?.settings ?? raw);
            this.#applySettings();
            this.#writeLocalSettings();
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#loadNativeSettings", __codeCodexCaught);
            if (!this.#canUseBridge(bridge, generation))
                return;
            // Local storage is the reversible fallback when native settings are unavailable.
        }
    }
    #applySettings(): void {
        this.#settings = { ...this.#settings, width: this.#clampWidth(this.#settings.width) };
        this.style.setProperty("--cle-width", `${this.#effectiveWidth()}px`);
        this.#resizeHandle.setAttribute("aria-valuenow", String(this.#settings.width));
        this.dataset.collapsed = String(this.#settings.collapsed);
        this.#collapseButton.setAttribute("aria-expanded", String(!this.#settings.collapsed));
        this.#collapsedTab.setAttribute("aria-expanded", String(!this.#settings.collapsed));
    }
    #writeLocalSettings(): void {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.#settings));
        }
        catch (__codeCodexCaught) {
            recordCaughtRuntimeError("#writeLocalSettings", __codeCodexCaught);
            // The native settings bridge remains available when DOM storage is disabled.
        }
    }
    #nativeSettings(): Record<string, unknown> {
        return {
            panelWidth: this.#settings.width,
            collapsed: this.#settings.collapsed,
            showHidden: true,
            showIgnored: true,
        };
    }
    #persistSettings(): void {
        this.#writeLocalSettings();
        if (this.#persistTimer)
            clearTimeout(this.#persistTimer);
        this.#persistTimer = setTimeout(() => {
            if (this.#workspaceSession.bridge?.available) {
                void this.#workspaceSession.bridge.request("explorer.settings.set", this.#nativeSettings()).catch(() => undefined);
            }
        }, 220);
    }
    #renderStatus(): void {
        const versionVisible = this.#state === "ready" || this.#state === "empty" || this.#state === "no-project";
        this.#statusCode.textContent = versionVisible ? (this.#versionFeedback.text ?? `v${__CODE_CODEX_VERSION__}`) : this.#state.toUpperCase().slice(0, 8);
        this.#versionFeedback.sync(versionVisible);
        this.#statusCode.disabled = !versionVisible || this.#updatesSettings.updateCheckPending || this.#updatesSettings.updateInstallPending;
        this.#statusCode.dataset.updateState = versionVisible ? this.#updatesSettings.updateCheckPresentation : "idle";
        this.#statusCode.setAttribute("aria-busy", String(versionVisible && (this.#updatesSettings.updateCheckPending || this.#updatesSettings.updateInstallPending)));
        if (versionVisible) {
            this.#statusCode.title = this.#updatesSettings.updateCheckSummary;
            this.#statusCode.setAttribute("aria-label", this.#updatesSettings.updateCheckSummary);
        }
        else {
            this.#statusCode.removeAttribute("title");
            this.#statusCode.setAttribute("aria-label", this.#statusCode.textContent);
        }
    }
    #announce(message: string): void {
        this.#liveRegion.textContent = "";
        requestAnimationFrame(() => (this.#liveRegion.textContent = message));
    }
    #showActionNotice(message: string, tone: "success" | "error" = "success"): void {
        // Only Code-Codex notices, never native conversation or form contents.
        runtimeEvent("renderer", "action notice", tone, { message: message.slice(0, 1000) });
        this.#hideActionNotice();
        this.#actionNotice.textContent = message;
        this.#actionNotice.dataset.tone = tone;
        this.#actionNotice.hidden = false;
        this.#presentActionNotice();
        this.#announce(message);
        this.#actionNoticeTimer = setTimeout(() => this.#hideActionNotice(), ACTION_NOTICE_DURATION_MS);
    }
    #showActionProgress(message: string): void {
        if (!this.#actionNotice.hidden && this.#actionNotice.dataset.tone === "progress") {
            this.#actionNotice.textContent = message;
            this.#presentActionNotice();
            return;
        }
        this.#hideActionNotice();
        this.#actionNotice.textContent = message;
        this.#actionNotice.dataset.tone = "progress";
        this.#actionNotice.hidden = false;
        this.#presentActionNotice();
        this.#announce(message);
    }
    #presentActionNotice(): void {
        if (!this.#actionNotice.isConnected)
            return;
        // Reinsert at the end of the top layer so even an open settings popover
        // cannot obscure a newly generated message.
        if (this.#actionNotice.matches(":popover-open"))
            this.#actionNotice.hidePopover();
        this.#actionNotice.showPopover();
        const anchor = this.#previewMarketOpen ? this.#previewMarketPopover : this;
        const rect = anchor.getBoundingClientRect();
        const width = Math.max(160, Math.min(rect.width - 16, window.innerWidth - 24));
        this.#actionNotice.style.width = `${width}px`;
        this.#actionNotice.style.left = `${Math.max(12, Math.min(rect.left + 8, window.innerWidth - width - 12))}px`;
        const height = this.#actionNotice.getBoundingClientRect().height;
        this.#actionNotice.style.top = `${Math.max(12, Math.min(rect.bottom - (this.#previewMarketOpen ? 8 : 36) - height, window.innerHeight - height - 12))}px`;
    }
    #hideActionNotice(): void {
        if (this.#actionNoticeTimer)
            clearTimeout(this.#actionNoticeTimer);
        this.#actionNoticeTimer = undefined;
        if (this.#actionNotice.matches(":popover-open"))
            this.#actionNotice.hidePopover();
        this.#actionNotice.hidden = true;
        this.#actionNotice.textContent = "";
        delete this.#actionNotice.dataset.tone;
    }
    #clearTimers(): void {
        if (this.#persistTimer)
            clearTimeout(this.#persistTimer);
        if (this.#treeinteractionSettings.typeaheadTimer)
            clearTimeout(this.#treeinteractionSettings.typeaheadTimer);
        if (this.#treeinteractionSettings.marqueeLongPressTimer)
            clearTimeout(this.#treeinteractionSettings.marqueeLongPressTimer);
        this.#cancelAppearanceHealthCheck();
        this.#hideActionNotice();
        for (const tab of this.#previewWorkspace.tabStore.items) {
            if (tab.timer)
                clearTimeout(tab.timer);
            tab.timer = undefined;
        }
        this.#clearWorkspaceTimers();
    }
    #clearWorkspaceTimers(): void {
        for (const timer of this.#changeTimers.values())
            clearTimeout(timer);
        for (const timer of this.#refreshTimers.values())
            clearTimeout(timer);
        this.#changeTimers.clear();
        this.#refreshTimers.clear();
        this.#pendingMarks.clear();
    }
}
