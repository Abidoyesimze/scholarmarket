"use client";

import React from "react";
import Link from "next/link";
import { FaInbox, FaSearch, FaExclamationCircle } from "react-icons/fa";

/**
 * Shared EmptyState component for consistent copy, styling, and accessibility across dashboard pages.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.icon] - Optional custom icon.
 * @param {string} props.title - Main heading text.
 * @param {string} [props.description] - Explanatory body text.
 * @param {'no-data' | 'no-results' | 'error' | 'no_data' | 'no_results'} [props.variant='no-data'] - Visual variant.
 * @param {'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'} [props.headingLevel='h2'] - Semantic heading level for accessibility.
 * @param {object} [props.primaryAction] - Primary CTA button { label, href, onClick, icon }.
 * @param {object} [props.action] - Alias for primaryAction.
 * @param {object} [props.secondaryAction] - Secondary CTA button { label, href, onClick, icon }.
 * @param {string} [props.className] - Extra container styling.
 */
export default function EmptyState({
  icon,
  title,
  description,
  variant = "no-data",
  headingLevel = "h2",
  primaryAction,
  action,
  secondaryAction,
  className = "",
}) {
  const normalizedVariant = variant ? variant.replace("_", "-") : "no-data";

  // Determine default icon and colors based on variant
  let defaultIcon;
  let iconBgClass;
  let iconColorClass;

  switch (normalizedVariant) {
    case "no-results":
      defaultIcon = <FaSearch className="text-2xl" />;
      iconBgClass = "bg-amber-50 dark:bg-amber-950/40";
      iconColorClass = "text-amber-500 dark:text-amber-400";
      break;
    case "error":
      defaultIcon = <FaExclamationCircle className="text-2xl" />;
      iconBgClass = "bg-rose-50 dark:bg-rose-950/40";
      iconColorClass = "text-rose-500 dark:text-rose-400";
      break;
    case "no-data":
    default:
      defaultIcon = <FaInbox className="text-2xl" />;
      iconBgClass = "bg-blue-50 dark:bg-blue-950/40";
      iconColorClass = "text-blue-500 dark:text-blue-400";
      break;
  }

  // Support heading levels for accessibility
  const validHeadingLevels = ["h1", "h2", "h3", "h4", "h5", "h6"];
  const HeadingTag = validHeadingLevels.includes(headingLevel?.toLowerCase())
    ? headingLevel.toLowerCase()
    : "h2";

  const effectivePrimary = primaryAction || action;

  const renderAction = (btnConfig, isPrimary = true) => {
    if (!btnConfig || !btnConfig.label) return null;

    const baseStyles =
      "inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer";
    const primaryStyles =
      "bg-blue-600 text-white rounded-full hover:bg-blue-700 active:bg-blue-800 shadow-sm";
    const secondaryStyles =
      "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100";

    const appliedStyles = `${baseStyles} ${isPrimary ? primaryStyles : secondaryStyles}`;

    const content = (
      <>
        {btnConfig.icon && <span className="shrink-0">{btnConfig.icon}</span>}
        <span>{btnConfig.label}</span>
      </>
    );

    if (btnConfig.href) {
      return (
        <Link href={btnConfig.href} className={appliedStyles}>
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={btnConfig.onClick}
        disabled={btnConfig.disabled}
        className={`${appliedStyles} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {content}
      </button>
    );
  };

  return (
    <div
      role="region"
      aria-label={title}
      className={`flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl ${className}`}
    >
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 shrink-0 ${iconBgClass} ${iconColorClass}`}
        aria-hidden="true"
      >
        {icon || defaultIcon}
      </div>

      <HeadingTag className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </HeadingTag>

      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
          {description}
        </p>
      )}

      {(effectivePrimary || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {renderAction(effectivePrimary, true)}
          {renderAction(secondaryAction, false)}
        </div>
      )}
    </div>
  );
}
