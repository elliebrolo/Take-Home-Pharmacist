import React from 'react';

export type PictorialType =
  | 'no_grapefruit'
  | 'no_alcohol'
  | 'no_dairy'
  | 'no_potassium_salt'
  | 'take_with_food'
  | 'empty_stomach'
  | 'separate_probiotics'
  | 'no_caffeine'
  | 'consistent_vitamin_k'
  | 'general_prohibition';

interface PictorialWarningLabelProps {
  type: PictorialType;
  customTitle?: string;
  customSubtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabelText?: boolean;
  className?: string;
}

export interface PictorialInfo {
  type: PictorialType;
  title: string;
  subtitle: string;
  category: 'prohibition' | 'positive' | 'spacing';
  themeColor: string;
}

export const PICTORIAL_DEFINITIONS: Record<PictorialType, PictorialInfo> = {
  no_grapefruit: {
    type: 'no_grapefruit',
    title: 'DO NOT EAT GRAPEFRUIT',
    subtitle: 'Avoid grapefruit & grapefruit juice completely',
    category: 'prohibition',
    themeColor: 'rose',
  },
  no_alcohol: {
    type: 'no_alcohol',
    title: 'DO NOT DRINK ALCOHOL',
    subtitle: 'Avoid alcoholic beverages while taking this medication',
    category: 'prohibition',
    themeColor: 'rose',
  },
  no_dairy: {
    type: 'no_dairy',
    title: 'DO NOT TAKE WITH MILK / DAIRY',
    subtitle: 'Separate milk, yogurt, and cheese by at least 2-4 hours',
    category: 'prohibition',
    themeColor: 'rose',
  },
  no_potassium_salt: {
    type: 'no_potassium_salt',
    title: 'NO POTASSIUM SALT SUBSTITUTES',
    subtitle: 'Avoid salt substitutes with potassium (No-Salt / Morton Lite)',
    category: 'prohibition',
    themeColor: 'rose',
  },
  take_with_food: {
    type: 'take_with_food',
    title: 'TAKE WITH FOOD OR MEALS',
    subtitle: 'Take during or immediately after meals with a glass of water',
    category: 'positive',
    themeColor: 'emerald',
  },
  empty_stomach: {
    type: 'empty_stomach',
    title: 'TAKE ON AN EMPTY STOMACH',
    subtitle: 'Take 1 hour before or 2 hours after meals with water',
    category: 'positive',
    themeColor: 'blue',
  },
  separate_probiotics: {
    type: 'separate_probiotics',
    title: 'SPACE YOGURT / PROBIOTICS 2H',
    subtitle: 'Take probiotics at least 2 to 3 hours apart from antibiotic',
    category: 'spacing',
    themeColor: 'amber',
  },
  no_caffeine: {
    type: 'no_caffeine',
    title: 'AVOID COFFEE & CAFFEINE',
    subtitle: 'Do not take with morning espresso, coffee, or energy drinks',
    category: 'prohibition',
    themeColor: 'rose',
  },
  consistent_vitamin_k: {
    type: 'consistent_vitamin_k',
    title: 'CONSISTENT LEAFY GREENS (VIT K)',
    subtitle: 'Maintain steady intake of spinach/kale; avoid sudden changes',
    category: 'spacing',
    themeColor: 'amber',
  },
  general_prohibition: {
    type: 'general_prohibition',
    title: 'RESTRICTED FOOD INTERACTION',
    subtitle: 'Check specific dietary contraindication details',
    category: 'prohibition',
    themeColor: 'rose',
  },
};

/**
 * Universal SVG Prohibition Sign Wrapper:
 * Renders an ISO/traffic-style red circular border with a bold diagonal slash line across the icon.
 */
const ProhibitionSign: React.FC<{
  children: React.ReactNode;
  dim: number;
  strokeWidth?: number;
}> = ({ children, dim, strokeWidth = 3 }) => {
  const radius = dim / 2 - strokeWidth;
  const center = dim / 2;

  // Diagonal slash coordinates from 135 deg to 315 deg (top-left to bottom-right)
  const offset = radius * 0.7071; // cos(45 deg)
  const x1 = center - offset;
  const y1 = center - offset;
  const x2 = center + offset;
  const y2 = center + offset;

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: dim, height: dim }}
    >
      {/* Background Graphic Content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {children}
      </div>

      {/* Traffic/ISO Prohibition Ring & Slash Overlay */}
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="absolute inset-0 pointer-events-none drop-shadow-sm"
      >
        {/* Outer Red Ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#dc2626"
          strokeWidth={strokeWidth}
        />
        {/* Diagonal 45-degree Strike Line */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#dc2626"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

/**
 * Positive / Spacing Badge Wrapper:
 * Green or Blue circle with checkmark or advisory border for "Take with Food", "Empty Stomach", etc.
 */
const PositiveSign: React.FC<{
  children: React.ReactNode;
  dim: number;
  color?: 'emerald' | 'blue' | 'amber';
  strokeWidth?: number;
}> = ({ children, dim, color = 'emerald', strokeWidth = 3 }) => {
  const radius = dim / 2 - strokeWidth;
  const center = dim / 2;
  const strokeColor =
    color === 'emerald' ? '#059669' : color === 'blue' ? '#2563eb' : '#d97706';

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: dim, height: dim }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {children}
      </div>
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="absolute inset-0 pointer-events-none drop-shadow-sm"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      </svg>
    </div>
  );
};

export const PictorialWarningLabel: React.FC<PictorialWarningLabelProps> = ({
  type,
  customTitle,
  customSubtitle,
  size = 'md',
  showLabelText = true,
  className = '',
}) => {
  const info = PICTORIAL_DEFINITIONS[type] || PICTORIAL_DEFINITIONS.general_prohibition;
  const title = customTitle || info.title;
  const subtitle = customSubtitle || info.subtitle;

  // Dimensions based on size
  const iconDim = size === 'sm' ? 36 : size === 'lg' ? 68 : 48;
  const strokeW = size === 'sm' ? 2.5 : size === 'lg' ? 4.5 : 3.5;

  // Render internal SVG icons
  const renderIconContent = () => {
    switch (type) {
      case 'no_grapefruit':
        return (
          <svg
            width={iconDim * 0.65}
            height={iconDim * 0.65}
            viewBox="0 0 24 24"
            fill="none"
            className="text-pink-600"
          >
            {/* Grapefruit outer rind */}
            <circle cx="12" cy="12" r="10" fill="#fbcfe8" stroke="#f43f5e" strokeWidth="1.5" />
            {/* Inner pulp segments */}
            <path
              d="M12 12 L12 4 A8 8 0 0 1 18.9 8 Z"
              fill="#fb7185"
              stroke="#e11d48"
              strokeWidth="0.5"
            />
            <path
              d="M12 12 L18.9 8 A8 8 0 0 1 18.9 16 Z"
              fill="#f43f5e"
              stroke="#e11d48"
              strokeWidth="0.5"
            />
            <path
              d="M12 12 L18.9 16 A8 8 0 0 1 12 20 Z"
              fill="#fb7185"
              stroke="#e11d48"
              strokeWidth="0.5"
            />
            <path
              d="M12 12 L12 20 A8 8 0 0 1 5.1 16 Z"
              fill="#f43f5e"
              stroke="#e11d48"
              strokeWidth="0.5"
            />
            <path
              d="M12 12 L5.1 16 A8 8 0 0 1 5.1 8 Z"
              fill="#fb7185"
              stroke="#e11d48"
              strokeWidth="0.5"
            />
            <path
              d="M12 12 L5.1 8 A8 8 0 0 1 12 4 Z"
              fill="#f43f5e"
              stroke="#e11d48"
              strokeWidth="0.5"
            />
            {/* Center white core */}
            <circle cx="12" cy="12" r="2.2" fill="#fff" />
          </svg>
        );

      case 'no_alcohol':
        return (
          <svg
            width={iconDim * 0.62}
            height={iconDim * 0.62}
            viewBox="0 0 24 24"
            fill="none"
            className="text-purple-600"
          >
            {/* Wine Glass */}
            <path
              d="M8 22h8M12 15v7M8 4a5 5 0 0 0 8 0H8Z"
              stroke="#6b21a8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="#e9d5ff"
            />
            {/* Wine Bottle outline */}
            <path
              d="M16 8v12M14 2h4v3a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V2Z"
              stroke="#7e22ce"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'no_dairy':
        return (
          <svg
            width={iconDim * 0.62}
            height={iconDim * 0.62}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Milk Carton */}
            <path
              d="M7 8l3-4h4l3 4v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8Z"
              fill="#e0f2fe"
              stroke="#0284c7"
              strokeWidth="2"
            />
            <path d="M7 8h10M10 4v4M14 4v4" stroke="#0284c7" strokeWidth="1.5" />
            {/* Cheese Wedge */}
            <path
              d="M12 15l7 3v3H12v-6Z"
              fill="#fef08a"
              stroke="#ca8a04"
              strokeWidth="1.5"
            />
          </svg>
        );

      case 'no_potassium_salt':
        return (
          <svg
            width={iconDim * 0.65}
            height={iconDim * 0.65}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Salt Shaker */}
            <path
              d="M8 10h8l1 11H7l1-11Z"
              fill="#f1f5f9"
              stroke="#475569"
              strokeWidth="2"
            />
            <path d="M9 5h6v5H9V5Z" fill="#94a3b8" stroke="#334155" strokeWidth="1.5" />
            <circle cx="10.5" cy="7.5" r="0.75" fill="#fff" />
            <circle cx="12" cy="6.5" r="0.75" fill="#fff" />
            <circle cx="13.5" cy="7.5" r="0.75" fill="#fff" />
            {/* "K+" badge */}
            <rect x="8.5" y="13" width="7" height="5" rx="1" fill="#fee2e2" />
            <text
              x="12"
              y="17"
              textAnchor="middle"
              fill="#b91c1c"
              fontSize="4"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              K+
            </text>
          </svg>
        );

      case 'take_with_food':
        return (
          <svg
            width={iconDim * 0.65}
            height={iconDim * 0.65}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Plate */}
            <circle cx="12" cy="12" r="9" fill="#d1fae5" stroke="#059669" strokeWidth="2" />
            <circle cx="12" cy="12" r="6" fill="#ecfdf5" stroke="#10b981" strokeWidth="1" />
            {/* Fork */}
            <path
              d="M8 7v4a1.5 1.5 0 0 0 3 0V7M9.5 11v6"
              stroke="#047857"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Knife */}
            <path
              d="M15 7v10M15 7a1.5 1.5 0 0 1 1.5 1.5v3.5H15"
              stroke="#047857"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'empty_stomach':
        return (
          <svg
            width={iconDim * 0.65}
            height={iconDim * 0.65}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Water Glass with clock */}
            <path
              d="M6 3h12l-2 16a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L6 3Z"
              fill="#dbeafe"
              stroke="#2563eb"
              strokeWidth="2"
            />
            <path d="M7 9h10" stroke="#60a5fa" strokeWidth="1.5" />
            {/* Clock 1hr indicator */}
            <circle cx="16" cy="16" r="4.5" fill="#fff" stroke="#1d4ed8" strokeWidth="1.5" />
            <path d="M16 13.5v2.5l1.5 1" stroke="#1d4ed8" strokeWidth="1" strokeLinecap="round" />
          </svg>
        );

      case 'separate_probiotics':
        return (
          <svg
            width={iconDim * 0.65}
            height={iconDim * 0.65}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Yogurt cup */}
            <path
              d="M6 7h12l-1.5 13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1L6 7Z"
              fill="#fef3c7"
              stroke="#d97706"
              strokeWidth="2"
            />
            <path d="M5 4h14a1 1 0 0 1 1 1v2H4V5a1 1 0 0 1 1-1Z" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" />
            {/* "2 hr" badge */}
            <rect x="7" y="11" width="10" height="6" rx="1.5" fill="#fff" stroke="#b45309" strokeWidth="1" />
            <text
              x="12"
              y="15.5"
              textAnchor="middle"
              fill="#b45309"
              fontSize="4"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              2 hrs
            </text>
          </svg>
        );

      case 'no_caffeine':
        return (
          <svg
            width={iconDim * 0.62}
            height={iconDim * 0.62}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Coffee mug */}
            <path
              d="M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z"
              fill="#ffedd5"
              stroke="#c2410c"
              strokeWidth="2"
            />
            <path
              d="M16 10h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"
              stroke="#c2410c"
              strokeWidth="2"
            />
            <path d="M8 3v3M12 3v3" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

      case 'consistent_vitamin_k':
        return (
          <svg
            width={iconDim * 0.65}
            height={iconDim * 0.65}
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Spinach / Leafy Greens */}
            <path
              d="M12 3c-4 2-6 7-3 12 3 5 8 5 8 5s0-5-2-9c-2-4-3-8-3-8Z"
              fill="#bbf7d0"
              stroke="#15803d"
              strokeWidth="2"
            />
            <path d="M12 11c0 5 3 9 3 9" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 14c2-1 4-1 4-1" stroke="#15803d" strokeWidth="1" strokeLinecap="round" />
          </svg>
        );

      case 'general_prohibition':
      default:
        return (
          <svg
            width={iconDim * 0.6}
            height={iconDim * 0.6}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="8" fill="#fee2e2" />
            <path
              d="M8 8l8 8M16 8l-8 8"
              stroke="#b91c1c"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        );
    }
  };

  const isProhibition = info.category === 'prohibition';

  // Pharmacy Auxiliary Sticker styling
  const stickerStyles = isProhibition
    ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900/80 text-rose-900 dark:text-rose-100'
    : info.category === 'positive'
    ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900/80 text-emerald-900 dark:text-emerald-100'
    : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/80 text-amber-900 dark:text-amber-100';

  return (
    <div
      className={`inline-flex items-center gap-3 p-2.5 rounded-xl border shadow-sm transition-all ${stickerStyles} ${className}`}
    >
      {/* Pictorial Sign (Prohibition with diagonal slash or Positive circle) */}
      {isProhibition ? (
        <ProhibitionSign dim={iconDim} strokeWidth={strokeW}>
          {renderIconContent()}
        </ProhibitionSign>
      ) : (
        <PositiveSign
          dim={iconDim}
          color={info.themeColor as any}
          strokeWidth={strokeW}
        >
          {renderIconContent()}
        </PositiveSign>
      )}

      {/* Auxiliary Label Typography */}
      {showLabelText && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-tight uppercase leading-tight ${
                size === 'sm'
                  ? 'text-[11px]'
                  : size === 'lg'
                  ? 'text-sm'
                  : 'text-xs'
              } ${
                isProhibition
                  ? 'text-rose-700 dark:text-rose-400'
                  : info.category === 'positive'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {title}
            </span>
          </div>
          {size !== 'sm' && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-snug mt-0.5 line-clamp-2">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Intelligent helper to detect which food pictorial warning labels apply
 * to a given medication's instructions, warnings, and food rules.
 */
export function detectMedicationPictorials(
  foodInstructions = '',
  warnings: string[] = [],
  withFood: string = '',
  medicationName = ''
): PictorialType[] {
  const text = `${foodInstructions} ${warnings.join(' ')} ${medicationName} ${withFood}`.toLowerCase();
  const results = new Set<PictorialType>();

  // Grapefruit
  if (text.includes('grapefruit') || text.includes('citrus paradisi')) {
    results.add('no_grapefruit');
  }

  // Alcohol
  if (text.includes('alcohol') || text.includes('wine') || text.includes('beer') || text.includes('spirits')) {
    results.add('no_alcohol');
  }

  // Dairy / Milk / Calcium
  if (
    text.includes('dairy') ||
    text.includes('milk') ||
    text.includes('cheese') ||
    text.includes('calcium-fortified')
  ) {
    results.add('no_dairy');
  }

  // Potassium Salt Substitutes
  if (
    text.includes('potassium') ||
    text.includes('salt substitute') ||
    text.includes('no-salt') ||
    text.includes('morton lite')
  ) {
    results.add('no_potassium_salt');
  }

  // Coffee / Caffeine
  if (text.includes('coffee') || text.includes('caffeine') || text.includes('espresso')) {
    results.add('no_caffeine');
  }

  // Probiotics / Yogurt spacing
  if (text.includes('probiotic') || text.includes('yogurt') || text.includes('kefir')) {
    results.add('separate_probiotics');
  }

  // Vitamin K (Warfarin)
  if (text.includes('vitamin k') || text.includes('spinach') || text.includes('kale') || text.includes('greens')) {
    results.add('consistent_vitamin_k');
  }

  // Take with Food vs Empty Stomach
  if (
    withFood === 'with_food' ||
    text.includes('take with food') ||
    text.includes('take with meals') ||
    text.includes('with breakfast') ||
    text.includes('with dinner')
  ) {
    results.add('take_with_food');
  } else if (
    withFood === 'empty_stomach' ||
    text.includes('empty stomach') ||
    text.includes('1 hour before') ||
    text.includes('2 hours after')
  ) {
    results.add('empty_stomach');
  }

  return Array.from(results);
}

/**
 * Intelligent helper for food search queries in the food checker
 */
export function detectFoodQueryPictorial(foodQuery = ''): PictorialType {
  const f = foodQuery.toLowerCase().trim();

  if (f.includes('grapefruit') || f.includes('pomelo')) return 'no_grapefruit';
  if (f.includes('alcohol') || f.includes('beer') || f.includes('wine') || f.includes('vodka') || f.includes('whiskey')) return 'no_alcohol';
  if (f.includes('milk') || f.includes('dairy') || f.includes('cheese') || f.includes('yogurt') && !f.includes('probiotic')) return 'no_dairy';
  if (f.includes('banana') || f.includes('potassium') || f.includes('salt substitute') || f.includes('no-salt')) return 'no_potassium_salt';
  if (f.includes('coffee') || f.includes('caffeine') || f.includes('espresso') || f.includes('tea')) return 'no_caffeine';
  if (f.includes('probiotic') || f.includes('kefir') || f.includes('yogurt')) return 'separate_probiotics';
  if (f.includes('spinach') || f.includes('kale') || f.includes('greens') || f.includes('broccoli') || f.includes('vitamin k')) return 'consistent_vitamin_k';

  return 'general_prohibition';
}
