import React from 'react'
import { useUIStore } from '../store/uiStore'
import { CalendarView } from '../components/Calendar/CalendarView'

export function CalendarPage(): React.ReactElement {
  const { selectedDate, setSelectedDate, selectedMonth, setSelectedMonth, setPage } = useUIStore()

  function handleSelectDate(date: string) {
    // alert("selectedDate: " + date)
    setSelectedDate(date)
    setPage('timeline')
  }

  function handlePrevMonth() {
    const { year, month } = selectedMonth
    if (month === 0) setSelectedMonth(year - 1, 11)
    else setSelectedMonth(year, month - 1)
  }

  function handleNextMonth() {
    const { year, month } = selectedMonth
    if (month === 11) setSelectedMonth(year + 1, 0)
    else setSelectedMonth(year, month + 1)
  }

  return (
    <CalendarView
      year={selectedMonth.year}
      month={selectedMonth.month}
      selectedDate={selectedDate}
      onSelectDate={handleSelectDate}
      onPrevMonth={handlePrevMonth}
      onNextMonth={handleNextMonth}
    />
  )
}
