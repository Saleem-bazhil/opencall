import { useState, useMemo } from "react";
import type { ReportHistorySession } from "../lib/apiClient";

export interface ReportHistoryPanelProps {
  sessions: ReportHistorySession[];
  onOpen: (session: ReportHistorySession) => void;
  onRename: (session: ReportHistorySession, newTitle: string) => void;
  onDelete: (session: ReportHistorySession) => void;
}

function groupSessions(sessions: ReportHistorySession[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const last7Days = new Date(today);
  last7Days.setDate(last7Days.getDate() - 7);

  const groups: Record<string, ReportHistorySession[]> = {
    "Today": [],
    "Yesterday": [],
    "Previous 7 Days": [],
    "Older": [],
  };

  sessions.forEach(s => {
    const d = new Date(s.createdAt);
    if (d >= today) groups["Today"]!.push(s);
    else if (d >= yesterday) groups["Yesterday"]!.push(s);
    else if (d >= last7Days) groups["Previous 7 Days"]!.push(s);
    else groups["Older"]!.push(s);
  });

  return groups;
}

export function ReportHistoryPanel({ sessions, onOpen, onRename, onDelete }: ReportHistoryPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "OLDEST">("NEWEST");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = useMemo(() => {
    let f = sessions;
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(s => 
        s.title.toLowerCase().includes(q) || 
        (s.regionId && s.regionId.toLowerCase().includes(q)) ||
        new Date(s.createdAt).toLocaleDateString().includes(q)
      );
    }
    if (statusFilter !== "ALL") {
      f = f.filter(s => s.status === statusFilter);
    }
    f.sort((a, b) => {
      const t1 = new Date(a.createdAt).getTime();
      const t2 = new Date(b.createdAt).getTime();
      return sortOrder === "NEWEST" ? t2 - t1 : t1 - t2;
    });
    return f;
  }, [sessions, search, statusFilter, sortOrder]);

  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  return (
    <aside className="reportHistoryPanel">
      <div className="historyHeader">
        <h2>History</h2>
      </div>

      <div className="historyControls">
        <input 
          className="historySearch" 
          placeholder="Search by title, date, region..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="historyFilters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="DRAFT">Draft</option>
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "NEWEST" | "OLDEST")}>
            <option value="NEWEST">Newest First</option>
            <option value="OLDEST">Oldest First</option>
          </select>
        </div>
      </div>

      <div className="historyList">
        {Object.entries(groups).map(([groupName, groupSessions]) => {
          if (groupSessions.length === 0) return null;
          return (
            <div key={groupName} className="historyGroup">
              <h3>{groupName}</h3>
              {groupSessions.map(session => (
                <div key={session.id} className="historyItem" onClick={() => { if (editingId !== session.id) onOpen(session); }}>
                  <div className="historyItemHeader">
                    {editingId === session.id ? (
                      <input 
                        value={editTitle}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={e => setEditTitle(e.target.value)}
                        onBlur={() => {
                          if (editTitle.trim() && editTitle !== session.title) {
                            onRename(session, editTitle.trim());
                          }
                          setEditingId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            if (editTitle.trim() && editTitle !== session.title) {
                              onRename(session, editTitle.trim());
                            }
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <strong>{session.title}</strong>
                    )}
                    <span className={`statusBadge ${session.status.toLowerCase()}`}>{session.status}</span>
                  </div>
                  <div className="historyItemMeta">
                    <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    {session.regionId && <span> • Region: {session.regionId.substring(0,8)}</span>}
                    {session.totalRows > 0 && <span> • {session.totalRows} rows</span>}
                  </div>
                  <div className="historyItemActions" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onOpen(session)}>Open</button>
                    <button onClick={() => { setEditingId(session.id); setEditTitle(session.title); }}>Rename</button>
                    <button onClick={() => onDelete(session)} className="deleteBtn">Del</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="noHistory">No sessions found.</p>}
      </div>
    </aside>
  );
}
