import React from 'react';
import {
  Compass,
  Sun,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  RotateCw,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';
import { LandmarkId, URUK_LANDMARKS, UrukLandmark } from '../data/urukLore';

interface ControlDockProps {
  activeLandmark: LandmarkId;
  onSelectLandmark: (id: LandmarkId) => void;
  sunsetProgress: number;
  onChangeSunset: (val: number) => void;
  activitySpeed: number;
  onChangeActivitySpeed: (val: number) => void;
  showMarkers: boolean;
  onToggleMarkers: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  audioPlaying: boolean;
  onToggleAudio: () => void;
  showLoreCard: boolean;
  onToggleLoreCard: () => void;
  isDockCollapsed: boolean;
  onToggleDockCollapse: () => void;
  currentLandmarkData: UrukLandmark;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  activeLandmark,
  onSelectLandmark,
  sunsetProgress,
  onChangeSunset,
  activitySpeed,
  onChangeActivitySpeed,
  showMarkers,
  onToggleMarkers,
  autoOrbit,
  onToggleAutoOrbit,
  audioPlaying,
  onToggleAudio,
  showLoreCard,
  onToggleLoreCard,
  isDockCollapsed,
  onToggleDockCollapse,
  currentLandmarkData,
}) => {
  const sunsetPhaseLabel =
    sunsetProgress < 0.33
      ? 'Золотой час'
      : sunsetProgress < 0.72
      ? 'Багровый закат'
      : 'Сумерки Шамаша';

  return (
    <>
      {/* Top Minimal Header & Collapsible Epic Chronicle Card (No backdrop-blur over WebGL) */}
      <div className="fixed top-4 left-4 right-4 z-20 pointer-events-none flex flex-col md:flex-row items-start justify-between gap-4">
        {/* Top-Left Minimal Spec / Title Block */}
        <div className="pointer-events-auto bg-[#170e09]/92 border border-amber-500/25 rounded-xl px-5 py-3.5 shadow-2xl max-w-md">
          <div className="flex items-center gap-2 text-xs text-amber-300/80 tracking-wider font-mono">
            <span>МЕСОПОТАМИЯ · 2750 Г. ДО Н. Э.</span>
            <span aria-hidden="true">·</span>
            <span>{currentLandmarkData.sumerianName}</span>
          </div>
          <h1 className="font-display text-lg md:text-xl font-bold text-[#fdf4e7] tracking-wide mt-0.5">
            Урук: Город Гильгамеша
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-amber-100/70">
            <span>{currentLandmarkData.shortLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{currentLandmarkData.tabletRef}</span>
          </div>
        </div>

        {/* Top-Right Compact Historical & Epic Quote Card (Toggled via Lore button) */}
        {showLoreCard && (
          <div className="pointer-events-auto bg-[#170e09]/92 border border-amber-500/25 rounded-xl p-4 shadow-2xl max-w-lg transition-opacity duration-150">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-amber-400/90">
                  {currentLandmarkData.tabletRef}
                </div>
                <h2 className="font-display text-base font-semibold text-[#fdf4e7] mt-0.5">
                  {currentLandmarkData.title}
                </h2>
              </div>
              <button
                onClick={onToggleLoreCard}
                className="text-xs text-amber-200/70 hover:text-amber-100 px-2 py-1 rounded border border-amber-500/20 hover:border-amber-400/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Скрыть летопись"
              >
                Скрыть
              </button>
            </div>

            <blockquote className="mt-2.5 text-xs md:text-sm italic text-amber-200/95 leading-relaxed">
              {currentLandmarkData.epicQuote}
            </blockquote>

            <p className="mt-2 text-xs text-[#e2d3c1]/85 leading-relaxed">
              {currentLandmarkData.historicalContext}
            </p>

            <div className="mt-2.5 pt-2.5 border-t border-amber-500/15 space-y-1">
              {currentLandmarkData.architecturalDetails.map((item, idx) => (
                <div
                  key={idx}
                  className="text-[11px] text-amber-100/75 flex items-baseline gap-2"
                >
                  <span className="font-mono text-amber-400/90 shrink-0">
                    0{idx + 1}.
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unified Collapsible Bottom Dock (Zero Central Viewport Occlusion) */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(960px,95vw)] pointer-events-none flex flex-col items-center"
      >
        {/* Collapse / Expand Drawer Tab */}
        <button
          onClick={onToggleDockCollapse}
          className="pointer-events-auto mb-1.5 flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#170e09]/95 border border-amber-500/30 text-xs font-medium text-amber-200 hover:text-white hover:border-amber-400 transition-colors shadow-lg cursor-pointer whitespace-nowrap shrink-0"
        >
          {isDockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Показать панель управления (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
              <span>Скрыть панель (H)</span>
            </>
          )}
        </button>

        {/* Main Bottom Dock Surface */}
        {!isDockCollapsed && (
          <div className="pointer-events-auto w-full bg-[#170e09]/95 border border-amber-500/30 rounded-2xl p-3.5 shadow-2xl space-y-3">
            {/* Row 1: Landmark Camera Tour Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300/90 pr-2 shrink-0">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Точки Урука:</span>
              </div>
              {URUK_LANDMARKS.map((lm) => {
                const active = activeLandmark === lm.id;
                return (
                  <button
                    key={lm.id}
                    onClick={() => onSelectLandmark(lm.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-[#170e09] font-semibold shadow-sm'
                        : 'bg-[#261710] text-amber-100/85 hover:bg-[#362117] hover:text-white border border-amber-500/15'
                    }`}
                  >
                    {lm.shortLabel}
                  </button>
                );
              })}
            </div>

            {/* Hairline Divider */}
            <div className="h-px bg-amber-500/15" />

            {/* Row 2: Sunset Lighting Slider, Street Life Speed & Scene Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Sunset Progression Slider */}
              <div className="flex items-center gap-3 flex-1 min-w-[230px]">
                <div className="flex items-center gap-1.5 text-xs text-amber-200/90 whitespace-nowrap shrink-0">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Закат ({sunsetPhaseLabel}):</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sunsetProgress}
                  onChange={(e) => onChangeSunset(parseFloat(e.target.value))}
                  className="uruk-slider w-full max-w-[170px]"
                  aria-label="Освещение заката"
                />
              </div>

              {/* Street Life Speed Selector */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1 text-xs text-amber-200/85 mr-1 whitespace-nowrap">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Улицы:</span>
                </div>
                {[
                  { label: 'Пауза', val: 0 },
                  { label: '1×', val: 1 },
                  { label: '2×', val: 2 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => onChangeActivitySpeed(opt.val)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activitySpeed === opt.val
                        ? 'bg-amber-500/90 text-[#170e09] font-semibold'
                        : 'bg-[#261710] text-amber-200/80 hover:text-white border border-amber-500/15'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Utility Toggles (Markers, Orbit, Lore, Lyre Soundscape) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={onToggleMarkers}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    showMarkers
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-[#261710] border-amber-500/15 text-amber-100/70 hover:text-white'
                  }`}
                >
                  {showMarkers ? (
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  <span>Метки</span>
                </button>

                <button
                  onClick={onToggleAutoOrbit}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    autoOrbit
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-[#261710] border-amber-500/15 text-amber-100/70 hover:text-white'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Облёт</span>
                </button>

                <button
                  onClick={onToggleLoreCard}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    showLoreCard
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-[#261710] border-amber-500/15 text-amber-100/70 hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Эпос</span>
                </button>

                <button
                  onClick={onToggleAudio}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    audioPlaying
                      ? 'bg-amber-500 text-[#170e09] border-amber-400 font-semibold'
                      : 'bg-[#261710] border-amber-500/15 text-amber-100/80 hover:text-white'
                  }`}
                >
                  {audioPlaying ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Лира Ура</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
