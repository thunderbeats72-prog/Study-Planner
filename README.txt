STUDY PLANNER PRO — FINAL DEPLOYMENT PACKAGE (2026-08-18)
==========================================================
Copy every file into the SAME path in your repository (drag the src
folder over yours), then:

  git add src/
  git commit -m "UI/UX final: mobile title fix, chat sheet, full responsive + animation pack"
  git push origin main

FILES
  src/app/globals.css             all styling: title-squeeze fix, opaque
                                  header/dock, chat bottom sheet, themes,
                                  animations, full device coverage
  src/app/page.tsx                loader, toast, age modes, back-close
  src/app/layout.tsx              viewport (safe areas, no zoom lock)
  src/app/api/chat/route.ts       brand-voice confirmations
  src/lib/ai.ts                   AI voice rules + action bridge
  src/lib/useBackClose.ts         Android back button closes overlays
  src/components/PlannerView.tsx  .task-main title fix + rating strip
  src/components/Dashboard.tsx    .task-main + designed empty states
  src/components/ChatPanel.tsx    thinking dots, single status dot
  src/components/FocusView.tsx    fluid input widths
  src/components/SettingsView.tsx responsive grids
  src/components/SubjectsView.tsx responsive grids
  src/components/TaskEditor.tsx   responsive grids

KEY FIXES IN THIS BUILD
- Task titles no longer stack letter-by-letter on phones (.task-main)
- Chat is a full-width bottom sheet on mobile: grab handle, swipeable
  quick suggestions, 44px input, no iOS zoom-on-focus
- Mobile header + dock fully opaque (no text ghosting through)
- LESSON/PENDING chips never wrap inside their pills
- Titles clamp to 2 lines with ellipsis on very small screens
