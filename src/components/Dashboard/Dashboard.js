import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { localDateStr, localDayStartISO, localDayEndISO } from '../../utils/dates';
function getRange(period, baseDate) {
    const d = new Date(baseDate);
    if (period === 'day') {
        const dayStr = localDateStr(d);
        const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        return { start: localDayStartISO(dayStr), end: localDayEndISO(dayStr), label };
    }
    if (period === 'week') {
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        const label = `Week of ${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - ${sunday.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        return { start: monday.toISOString(), end: sunday.toISOString(), label };
    }
    // month
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return { start: first.toISOString(), end: last.toISOString(), label };
}
function formatHours(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
}
function formatHoursShort(minutes) {
    return (minutes / 60).toFixed(1);
}
export function Dashboard() {
    const [period, setPeriod] = useState('week');
    const [baseDate, setBaseDate] = useState(new Date());
    const [dailyStats, setDailyStats] = useState([]);
    const [tagStats, setTagStats] = useState([]);
    const [loading, setLoading] = useState(false);
    const range = getRange(period, baseDate);
    useEffect(() => {
        setLoading(true);
        Promise.all([
            window.api.stats.daily(range.start, range.end),
            window.api.stats.byTag(range.start, range.end)
        ]).then(([daily, tags]) => {
            setDailyStats(daily);
            setTagStats(tags);
            setLoading(false);
        });
    }, [period, baseDate]);
    const handlePrev = () => {
        const next = new Date(baseDate);
        if (period === 'day')
            next.setDate(next.getDate() - 1);
        else if (period === 'week')
            next.setDate(next.getDate() - 7);
        else
            next.setMonth(next.getMonth() - 1);
        setBaseDate(next);
    };
    const handleNext = () => {
        const next = new Date(baseDate);
        if (period === 'day')
            next.setDate(next.getDate() + 1);
        else if (period === 'week')
            next.setDate(next.getDate() + 7);
        else
            next.setMonth(next.getMonth() + 1);
        if (next <= new Date())
            setBaseDate(next);
    };
    const isAtPresent = (() => {
        const now = new Date();
        if (period === 'day')
            return localDateStr(baseDate) === localDateStr(now);
        if (period === 'week')
            return getRange('week', now).start === range.start;
        return baseDate.getFullYear() === now.getFullYear() && baseDate.getMonth() === now.getMonth();
    })();
    const totalMinutes = dailyStats.reduce((a, b) => a + b.totalMinutes, 0);
    const productiveMinutes = dailyStats.reduce((a, b) => a + b.productiveMinutes, 0);
    const productiveErosMinutes = dailyStats.reduce((a, b) => a + (b.productiveErosMinutes || 0), 0);
    const semiProductiveMinutes = dailyStats.reduce((a, b) => a + (b.semiProductiveMinutes || 0), 0);
    const prodPlusSemiMinutes = productiveMinutes + semiProductiveMinutes + productiveErosMinutes;
    const productivePercent = totalMinutes > 0 ? Math.round((productiveMinutes / totalMinutes) * 100) : 0;
    const prodPlusSemiPercent = totalMinutes > 0 ? Math.round((prodPlusSemiMinutes / totalMinutes) * 100) : 0;
    const activeDays = dailyStats.filter((d) => d.totalMinutes > 0).length;
    const maxDayMinutes = Math.max(...dailyStats.map((d) => d.totalMinutes), 1);
    const maxTagMinutes = Math.max(...tagStats.map((t) => t.totalMinutes), 1);
    return (_jsxs("div", { className: "dashboard-page", children: [_jsxs("div", { className: "dashboard-header", children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: [_jsxs("h2", { className: "dashboard-title", children: ["Statistics", ' ', _jsxs("span", { style: { fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }, children: ["(active days: ", activeDays, " ", activeDays === 1 ? 'day' : 'days', ")"] })] }), _jsxs("div", { className: "period-navigation", children: [_jsx("button", { className: "date-nav-btn", onClick: handlePrev, children: "\u2039" }), _jsx("span", { className: "current-range", children: range.label }), _jsx("button", { className: "date-nav-btn", onClick: handleNext, disabled: isAtPresent, style: { opacity: isAtPresent ? 0.3 : 1 }, children: "\u203A" })] })] }), _jsx("div", { className: "period-selector", children: ['day', 'week', 'month'].map((p) => (_jsx("button", { className: `period-btn ${period === p ? 'active' : ''}`, onClick: () => { setPeriod(p); setBaseDate(new Date()); }, children: p.charAt(0).toUpperCase() + p.slice(1) }, p))) })] }), loading ? (_jsx("div", { style: { color: 'var(--text-muted)', textAlign: 'center', padding: 40 }, children: "Loading..." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stats-grid", style: { gridTemplateColumns: 'repeat(4, 1fr)' }, children: [_jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Work + Personal Projects + Study" }), _jsxs("div", { className: "stat-card-value", children: [formatHoursShort(totalMinutes), _jsx("span", { style: { fontSize: 18, color: 'var(--text-muted)' }, children: "h" })] }), _jsx("div", { className: "stat-card-sub", children: formatHours(totalMinutes) })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Work" }), _jsxs("div", { className: "stat-card-value", children: [formatHoursShort(productiveMinutes), _jsx("span", { style: { fontSize: 18, color: 'var(--text-muted)' }, children: "h" })] }), _jsxs("div", { className: "stat-card-sub", children: [productivePercent, "% of tracked time"] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Prod + Semi" }), _jsxs("div", { className: "stat-card-value", children: [formatHoursShort(prodPlusSemiMinutes), _jsx("span", { style: { fontSize: 18, color: 'var(--text-muted)' }, children: "h" })] }), _jsxs("div", { className: "stat-card-sub", children: [prodPlusSemiPercent, "% of tracked time"] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Active Days" }), _jsx("div", { className: "stat-card-value", children: activeDays }), _jsxs("div", { className: "stat-card-sub", children: [dailyStats.length, " days in period"] })] })] }), dailyStats.length > 0 && (_jsxs("div", { className: "chart-section", children: [_jsx("div", { className: "chart-title", children: "Daily Breakdown" }), _jsxs("div", { style: { position: 'relative' }, children: [_jsx("div", { className: "bar-chart", children: dailyStats.map((d) => {
                                            const heightPct = (d.totalMinutes / maxDayMinutes) * 100;
                                            const prodPct = d.totalMinutes > 0 ? (d.productiveMinutes / d.totalMinutes) * 100 : 0;
                                            const erosPct = d.totalMinutes > 0 ? ((d.productiveErosMinutes || 0) / d.totalMinutes) * 100 : 0;
                                            const semiPct = d.totalMinutes > 0 ? ((d.semiProductiveMinutes || 0) / d.totalMinutes) * 100 : 0;
                                            const dateLabel = d.date.slice(5);
                                            return (_jsxs("div", { className: "bar-chart-bar", style: { height: `${Math.max(2, heightPct)}%`, background: '#6366f1', position: 'relative' }, title: `${d.date}: ${formatHours(d.totalMinutes)} (${Math.round(prodPct)}% prod, ${Math.round(erosPct)}% eros, ${Math.round(semiPct)}% semi)`, children: [_jsx("div", { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: `${prodPct}%`, background: '#22c55e', borderRadius: 'inherit', zIndex: 3 } }), _jsx("div", { style: { position: 'absolute', bottom: `${prodPct}%`, left: 0, right: 0, height: `${erosPct}%`, background: '#fb7185', zIndex: 2 } }), _jsx("div", { style: { position: 'absolute', bottom: `${prodPct + erosPct}%`, left: 0, right: 0, height: `${semiPct}%`, background: '#a855f7', zIndex: 1 } }), _jsx("div", { className: "bar-chart-label", children: dateLabel })] }, d.date));
                                        }) }), _jsxs("div", { style: { marginTop: 28, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("span", { style: { width: 10, height: 10, borderRadius: 2, background: '#6366f1', display: 'inline-block' } }), " Total"] }), _jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("span", { style: { width: 10, height: 10, borderRadius: 2, background: '#22c55e', display: 'inline-block' } }), " Productive"] }), _jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("span", { style: { width: 10, height: 10, borderRadius: 2, background: '#a855f7', display: 'inline-block' } }), " Semi-productive"] })] })] })] })), tagStats.length > 0 && (_jsxs("div", { className: "chart-section", children: [_jsx("div", { className: "chart-title", children: "By Tag" }), _jsx("div", { className: "tag-stats-list", children: tagStats.map((ts) => (_jsxs("div", { className: "tag-stat-row", children: [_jsx("div", { className: "tag-stat-color", style: { background: ts.tagColor || '#6b7280' } }), _jsx("span", { className: "tag-stat-name", children: ts.tagName || 'No tag' }), _jsx("div", { className: "tag-stat-bar-wrap", children: _jsx("div", { className: "tag-stat-bar", style: { width: `${(ts.totalMinutes / maxTagMinutes) * 100}%`, background: ts.tagColor || '#6b7280' } }) }), _jsxs("span", { className: "tag-stat-hours", children: [formatHoursShort(ts.totalMinutes), "h"] })] }, ts.tagId ?? 'null'))) })] })), tagStats.length === 0 && dailyStats.length === 0 && (_jsx("div", { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 60 }, children: "No data for this period. Start tracking tasks!" }))] }))] }));
}
