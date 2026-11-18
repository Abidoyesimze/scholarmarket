"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import "./moderation.css";
import { withAdminGuard } from "@/lib/auth/adminAuth";
import Pagination from "@/components/ui/Pagination";
import {
  FaCheck,
  FaBan,
  FaTimes,
  FaFilter,
  FaExclamationTriangle,
  FaSearch,
} from "react-icons/fa";

const REASONS = [
  "Copyright violation",
  "Inappropriate content",
  "Harassment",
  "Spam",
  "Fraud / Scam",
  "Low Quality / Misleading",
];

const STATUSES = ["pending", "approved", "delisted", "dismissed"];

// Generate deterministic pool of reports for scalable pagination and filtering
function generateSampleReports() {
  const reports = [];
  const baseDate = new Date("2026-11-18T20:00:00.000Z").getTime();

  for (let i = 1; i <= 60; i += 1) {
    const reasonIndex = i % REASONS.length;
    const statusIndex = i % 7 === 0 ? 1 : i % 11 === 0 ? 2 : 0; // majority pending
    const daysAgo = (i % 30);
    const createdAt = new Date(baseDate - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    reports.push({
      id: `rep-${i}`,
      title: `Educational Material #${i} - ${i % 2 === 0 ? "Interactive Module" : "Course Notes"}`,
      materialId: `mat-${1000 + i}`,
      reason: REASONS[reasonIndex],
      reporter: `user_${((i * 37) % 500) + 100}`,
      status: STATUSES[statusIndex],
      createdAt,
      details: `Reported issue concerning ${REASONS[reasonIndex].toLowerCase()} in section ${(i % 5) + 1}.`,
    });
  }
  return reports;
}

const SAMPLE_REPORTS = generateSampleReports();

function ModerationDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL-synced filter parameters
  const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const statusParam = searchParams.get("status") || "all";
  const reasonParam = searchParams.get("reason") || "all";
  const dateParam = searchParams.get("date") || "all";
  const searchParam = searchParams.get("q") || "";

  const [reports, setReports] = useState(SAMPLE_REPORTS);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null); // { message, type }
  const [itemErrors, setItemErrors] = useState({}); // { [id]: "Error message" }
  const [itemSuccesses, setItemSuccesses] = useState({}); // { [id]: "Success message" }

  // Delist modal state
  const [showDelistModal, setShowDelistModal] = useState(false);
  const [delistReason, setDelistReason] = useState("");
  const [delistReasonError, setDelistReasonError] = useState("");

  const pageSize = 20;

  // Filter application
  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (statusParam !== "all" && item.status !== statusParam) return false;
      if (reasonParam !== "all" && item.reason !== reasonParam) return false;
      if (searchParam && !item.title.toLowerCase().includes(searchParam.toLowerCase()) && !item.reporter.toLowerCase().includes(searchParam.toLowerCase())) {
        return false;
      }

      if (dateParam !== "all") {
        const itemDate = new Date(item.createdAt).getTime();
        const now = new Date("2026-11-18T23:00:00.000Z").getTime();
        const oneDay = 24 * 60 * 60 * 1000;

        if (dateParam === "today" && now - itemDate > oneDay) return false;
        if (dateParam === "7d" && now - itemDate > 7 * oneDay) return false;
        if (dateParam === "30d" && now - itemDate > 30 * oneDay) return false;
      }

      return true;
    });
  }, [reports, statusParam, reasonParam, dateParam, searchParam]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const currentPage = Math.min(pageParam, totalPages);

  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredReports.slice(startIndex, startIndex + pageSize);
  }, [filteredReports, currentPage, pageSize]);

  // Sync state changes with URL query parameters
  const updateUrlParams = useCallback(
    (newParams) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      // Reset to page 1 if filters change without an explicit page
      if (!newParams.page && (newParams.status !== undefined || newParams.reason !== undefined || newParams.date !== undefined || newParams.q !== undefined)) {
        params.delete("page");
      }

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Checkbox selection helpers
  const allCurrentPageSelected =
    paginatedReports.length > 0 &&
    paginatedReports.every((item) => selectedIds.has(item.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allCurrentPageSelected) {
      paginatedReports.forEach((item) => next.delete(item.id));
    } else {
      paginatedReports.forEach((item) => next.add(item.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Perform bulk action
  const executeBulkAction = async (action, customReason = null) => {
    if (selectedIds.size === 0) return;

    setIsProcessing(true);
    setActionFeedback(null);

    const targetIds = Array.from(selectedIds);
    const nextItemErrors = { ...itemErrors };
    const nextItemSuccesses = { ...itemSuccesses };
    const remainingSelected = new Set(selectedIds);

    let successCount = 0;
    let failureCount = 0;

    // Process all selected items (up to 20 or more in one action)
    for (const id of targetIds) {
      const item = reports.find((r) => r.id === id);

      // Simulate network / validation: items with ID ending in '99' or specific edge conditions fail
      const shouldFail = id === "rep-999" || (action === "delist" && !customReason);

      if (shouldFail) {
        failureCount += 1;
        nextItemErrors[id] = `Failed to ${action} item #${id}: Invalid moderation state or missing parameters.`;
        // Failed items stay selected
      } else {
        successCount += 1;
        delete nextItemErrors[id];
        nextItemSuccesses[id] = `Successfully marked as ${action}ed.`;
        remainingSelected.delete(id); // Succeeded items unselected

        // Update local report status
        setReports((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: action === "approve" ? "approved" : action === "delist" ? "delisted" : "dismissed",
                  delistReason: action === "delist" ? customReason : r.delistReason,
                }
              : r
          )
        );
      }
    }

    setItemErrors(nextItemErrors);
    setItemSuccesses(nextItemSuccesses);
    setSelectedIds(remainingSelected);
    setIsProcessing(false);

    if (failureCount === 0) {
      setActionFeedback({
        type: "success",
        message: `Successfully processed ${successCount} report${successCount === 1 ? "" : "s"} (${action}).`,
      });
    } else {
      setActionFeedback({
        type: "warning",
        message: `Processed ${successCount} item(s) successfully; ${failureCount} failed item(s) remain selected with error details.`,
      });
    }
  };

  const handleDelistClick = () => {
    setDelistReason("");
    setDelistReasonError("");
    setShowDelistModal(true);
  };

  const confirmBulkDelist = async () => {
    if (!delistReason.trim()) {
      setDelistReasonError("A reason is strictly required when delisting content in bulk.");
      return;
    }
    setShowDelistModal(false);
    await executeBulkAction("delist", delistReason.trim());
  };

  return (
    <section className="admin-moderation">
      <div className="moderation-header">
        <h2 className="title">Content Moderation Dashboard</h2>
        <p className="subtitle">
          Review reported course materials, filter by category and date, and execute bulk moderation actions.
        </p>
      </div>

      {/* Filter and Search Bar synced to URL */}
      <div className="mod-filters-panel" role="search" aria-label="Moderation filters">
        <div className="filter-group">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={statusParam}
            onChange={(e) => updateUrlParams({ status: e.target.value })}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="delisted">Delisted</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-reason">Reason</label>
          <select
            id="filter-reason"
            value={reasonParam}
            onChange={(e) => updateUrlParams({ reason: e.target.value })}
            className="filter-select"
          >
            <option value="all">All Reasons</option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-date">Date Range</label>
          <select
            id="filter-date"
            value={dateParam}
            onChange={(e) => updateUrlParams({ date: e.target.value })}
            className="filter-select"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7d">Past 7 Days</option>
            <option value="30d">Past 30 Days</option>
          </select>
        </div>

        <div className="filter-group search-group">
          <label htmlFor="filter-search">Search</label>
          <div className="search-input-wrapper">
            <FaSearch className="search-icon" />
            <input
              id="filter-search"
              type="text"
              placeholder="Title or reporter..."
              value={searchParam}
              onChange={(e) => updateUrlParams({ q: e.target.value })}
              className="filter-search-input"
            />
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {actionFeedback && (
        <div className={`action-feedback-banner ${actionFeedback.type}`} role="status">
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            className="feedback-dismiss"
            onClick={() => setActionFeedback(null)}
            aria-label="Dismiss message"
          >
            <FaTimes />
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar" role="toolbar" aria-label="Bulk actions toolbar">
          <div className="bulk-info">
            <span className="selected-count-badge">{selectedIds.size}</span>
            <span>report{selectedIds.size === 1 ? "" : "s"} selected</span>
          </div>

          <div className="bulk-buttons">
            <button
              type="button"
              className="bulk-btn approve-btn"
              disabled={isProcessing}
              onClick={() => executeBulkAction("approve")}
            >
              <FaCheck /> Approve Selected
            </button>

            <button
              type="button"
              className="bulk-btn delist-btn"
              disabled={isProcessing}
              onClick={handleDelistClick}
            >
              <FaBan /> Delist Selected
            </button>

            <button
              type="button"
              className="bulk-btn dismiss-btn"
              disabled={isProcessing}
              onClick={() => executeBulkAction("dismiss")}
            >
              <FaTimes /> Dismiss Reports
            </button>

            <button
              type="button"
              className="bulk-btn cancel-btn"
              disabled={isProcessing}
              onClick={() => {
                setSelectedIds(new Set());
                setItemErrors({});
              }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Moderation Items Table */}
      {paginatedReports.length === 0 ? (
        <div className="empty-state">
          <FaFilter className="empty-icon" />
          <p className="empty">No reports match the current filter criteria.</p>
          <button
            type="button"
            className="clear-filters-btn"
            onClick={() => router.push(pathname)}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="mod-table" aria-label="Moderation reports table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all reports on current page"
                  />
                </th>
                <th>ID</th>
                <th>Material Title</th>
                <th>Reason</th>
                <th>Reporter</th>
                <th>Reported Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedReports.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const hasError = Boolean(itemErrors[item.id]);
                const hasSuccess = Boolean(itemSuccesses[item.id]);

                return (
                  <React.Fragment key={item.id}>
                    <tr className={[isSelected ? "row-selected" : "", hasError ? "row-error" : ""].join(" ")}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(item.id)}
                          aria-label={`Select report ${item.id}`}
                        />
                      </td>
                      <td className="item-id-cell">{item.id}</td>
                      <td>
                        <span className="item-title">{item.title}</span>
                      </td>
                      <td>
                        <span className="reason-pill">{item.reason}</span>
                      </td>
                      <td>{item.reporter}</td>
                      <td className="date-cell">
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        <span className={`status-badge status-${item.status}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="action-cell">
                        <button
                          type="button"
                          className="action-btn approve"
                          onClick={() => {
                            setSelectedIds(new Set([item.id]));
                            executeBulkAction("approve");
                          }}
                          title="Approve material"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="action-btn deny"
                          onClick={() => {
                            setSelectedIds(new Set([item.id]));
                            handleDelistClick();
                          }}
                          title="Delist material"
                        >
                          Delist
                        </button>
                        <button
                          type="button"
                          className="action-btn suspend"
                          onClick={() => {
                            setSelectedIds(new Set([item.id]));
                            executeBulkAction("dismiss");
                          }}
                          title="Dismiss report"
                        >
                          Dismiss
                        </button>
                      </td>
                    </tr>

                    {/* Per-item Error or Success Message Display */}
                    {(hasError || hasSuccess) && (
                      <tr className="feedback-row">
                        <td colSpan={8}>
                          {hasError && (
                            <div className="item-error-banner" role="alert">
                              <FaExclamationTriangle />
                              <span>{itemErrors[item.id]}</span>
                            </div>
                          )}
                          {!hasError && hasSuccess && (
                            <div className="item-success-banner">
                              <FaCheck />
                              <span>{itemSuccesses[item.id]}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Shared Pagination Component */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={(newPage) => updateUrlParams({ page: newPage })}
      />

      {/* Required Delist Reason Modal */}
      {showDelistModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-content">
            <h3 id="modal-title" className="modal-title">
              Delist Content ({selectedIds.size} item{selectedIds.size === 1 ? "" : "s"})
            </h3>
            <p className="modal-description">
              Please specify the formal reason for delisting the selected content. This explanation will be logged in the audit trail and sent to the material creator.
            </p>

            <div className="modal-form-group">
              <label htmlFor="delist-reason-input" className="modal-label">
                Delisting Reason <span className="required-star">*</span>
              </label>
              <textarea
                id="delist-reason-input"
                className={`delist-textarea ${delistReasonError ? "input-error" : ""}`}
                rows={4}
                placeholder="Enter mandatory reason (e.g. Verified copyright violation DMCA #10492)..."
                value={delistReason}
                onChange={(e) => {
                  setDelistReason(e.target.value);
                  if (delistReasonError) setDelistReasonError("");
                }}
              />
              {delistReasonError && (
                <p className="form-error-msg" role="alert">
                  {delistReasonError}
                </p>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDelistModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmBulkDelist}
              >
                Confirm Bulk Delist
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default withAdminGuard(ModerationDashboard);
