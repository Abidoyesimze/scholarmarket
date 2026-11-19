"use client";

import React from 'react';
import './moderation.css';
import { useModerationQueue, useResolveReport } from '@/hooks/api/useModeration';
import { QueryStateProvider } from '@/components/common/QueryStateProvider';

function AccessDenied() {
  return (
    <section className="admin-moderation" data-testid="moderation-access-denied">
      <h2 className="title">Access denied</h2>
      <p className="empty">Content moderation is available to administrators only.</p>
    </section>
  );
}

function ModerationDashboard() {
  const queueQuery = useModerationQueue();
  const resolveReport = useResolveReport();

  const status = queueQuery.error?.status;
  if (status === 401 || status === 403) {
    return <AccessDenied />;
  }

  const pendingId = resolveReport.isPending ? resolveReport.variables?.reportId : null;

  return (
    <section className="admin-moderation">
      <h2 className="title">Content Moderation Dashboard</h2>
      {resolveReport.error ? (
        <p role="alert" className="empty">{resolveReport.error.message}</p>
      ) : null}
      <QueryStateProvider
        query={queueQuery}
        loadingComponent={<p className="loading">Loading flagged content...</p>}
        emptyComponent={<p className="empty">No flagged items at the moment.</p>}
        renderData={(items) => (
          <table className="mod-table" data-testid="moderation-queue">
            <thead>
              <tr>
                <th>Material</th>
                <th>Reason</th>
                <th>Details</th>
                <th>Reporter</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} data-testid="moderation-report">
                  <td>{item.materialTitle || item.materialId}</td>
                  <td>{item.reason}</td>
                  <td>{item.description || '—'}</td>
                  <td>{item.reporterAddress || 'Anonymous'}</td>
                  <td className="action-cell">
                    <button
                      type="button"
                      className="action-btn deny"
                      disabled={pendingId === item.id}
                      onClick={() => resolveReport.mutate({ reportId: item.id, action: 'delist' })}
                    >
                      Delist
                    </button>
                    <button
                      type="button"
                      className="action-btn approve"
                      disabled={pendingId === item.id}
                      onClick={() => resolveReport.mutate({ reportId: item.id, action: 'dismiss' })}
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
    </section>
  );
}

export default ModerationDashboard;
