// src/lib/theme.ts
export const palette = {
  // Brand greens
  evergreen:   '#0d2818',   // darkest — dark mode sidebar bg, dark mode page bg
  blackForest: '#04471c',   // primary action, table headers, active elements
  forestMid:   '#0a5c24',   // hover state for blackForest
  sageGreen:   '#7ea16b',   // secondary text, borders, muted elements
  teaGreen:    '#c3d898',   // light green — text on dark, light badge fills
  teaLight:    '#eaf4d3',   // very light green — light mode card alternates, badge bg

  // Semantic
  burgundy:     '#70161e',   // danger/destructive ONLY
  burgundyHover:'#8b1a1a',
  burgundyText: '#f5c0c3',

  // Light mode surfaces
  lightPageBg:  '#f0f4ee',   // page background in light mode (green-tinted, NOT gray)
  lightSidebar: '#ffffff',   // sidebar in light mode
  lightCard:    '#ffffff',
  lightBorder:  '#d4e3cc',   // all borders in light mode
  lightRowAlt:  '#f7faf4',   // alternating table row in light mode

  // Dark mode surfaces
  darkPageBg:   '#0d2818',   // page background in dark mode
  darkSidebar:  '#071a0e',   // sidebar even darker than page in dark mode
  darkCard:     'rgba(195,216,152,0.06)',  // subtle card in dark mode
  darkBorder:   'rgba(195,216,152,0.12)', // all borders in dark mode
  darkRowAlt:   'rgba(195,216,152,0.04)', // alternating table row in dark mode

  // Text
  textOnDark:   '#c3d898',   // primary text in dark mode
  mutedOnDark:  '#7ea16b',   // secondary text in dark mode
  dimOnDark:    '#4a7a40',   // very muted — footer text, placeholders in dark

  // Status badges (same in both modes)
  presentBg:    '#eaf4d3',  presentText: '#04471c',
  lateBg:       '#fff3e0',  lateText:    '#b35c00',
  absentBg:     '#fdecea',  absentText:  '#8b1a1a',
} as const;
