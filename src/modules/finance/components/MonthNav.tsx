import React from 'react'
import { useFinanceStore } from '../store/financeStore'
import { monthLabel, shiftMonth } from '../util'

export function MonthNav(): React.ReactElement {
  const { month, setMonth } = useFinanceStore()
  return (
    <div className="date-nav">
      <button className="date-nav-btn" onClick={() => setMonth(shiftMonth(month, -1))}>
        ‹
      </button>
      <span className="date-display" style={{ minWidth: 160, textTransform: 'capitalize' }}>
        {monthLabel(month)}
      </span>
      <button className="date-nav-btn" onClick={() => setMonth(shiftMonth(month, 1))}>
        ›
      </button>
    </div>
  )
}
