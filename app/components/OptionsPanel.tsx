"use client";

import { ROLE_TYPES, RoleType } from "@/app/lib/types";

interface Props {
  roleType: RoleType;
  detectedRole?: RoleType;
  onRoleChange: (r: RoleType) => void;
  includeCoverLetter: boolean;
  onIncludeCoverLetterChange: (v: boolean) => void;
  allRelevantProjects: boolean;
  onAllRelevantProjectsChange: (v: boolean) => void;
  extraContext: string;
  onExtraContextChange: (v: string) => void;
  disabled?: boolean;
}

export default function OptionsPanel(props: Props) {
  const {
    roleType,
    detectedRole,
    onRoleChange,
    includeCoverLetter,
    onIncludeCoverLetterChange,
    allRelevantProjects,
    onAllRelevantProjectsChange,
    extraContext,
    onExtraContextChange,
    disabled,
  } = props;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            Role Type
          </label>
          {detectedRole && detectedRole === roleType && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Auto-detected
            </span>
          )}
        </div>
        <select
          value={roleType}
          onChange={(e) => onRoleChange(e.target.value as RoleType)}
          disabled={disabled}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {ROLE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <input
            type="checkbox"
            checked={includeCoverLetter}
            onChange={(e) => onIncludeCoverLetterChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Generate cover letter too
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <input
            type="checkbox"
            checked={allRelevantProjects}
            onChange={(e) => onAllRelevantProjectsChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Include all key achievements (otherwise top 3 only)
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          Extra context (optional)
        </label>
        <input
          type="text"
          value={extraContext}
          onChange={(e) => onExtraContextChange(e.target.value)}
          placeholder="e.g. 'emphasise food safety experience' or 'lean more people-management focused'"
          disabled={disabled}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>
    </div>
  );
}
