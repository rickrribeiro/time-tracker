import React from 'react'
import { ModulePlaceholder } from '../../_shared/ModulePlaceholder'

export function FinanceDashboardPage(): React.ReactElement {
  return (
    <ModulePlaceholder
      icon="💰"
      title="Finanças — Dashboard"
      subtitle="Saldo, gastos do mês, top categorias, evolução, meta"
      note="Tabelas accounts/transactions/categories/budgets/investments já criadas. Importação CSV (Nubank/Inter/Wise) e gráficos entram numa próxima sessão."
    />
  )
}

export function TransactionsPage(): React.ReactElement {
  return (
    <ModulePlaceholder
      icon="💸"
      title="Transações"
      subtitle="Receitas e despesas, multi-moeda BRL/JPY/USD"
      note="Tabela transactions criada. CRUD e importação CSV em breve."
    />
  )
}

export function BudgetPage(): React.ReactElement {
  return (
    <ModulePlaceholder icon="📉" title="Orçamento" subtitle="Orçamento mensal por categoria" />
  )
}

export function InvestmentsPage(): React.ReactElement {
  return <ModulePlaceholder icon="📈" title="Investimentos" subtitle="Posições e evolução" />
}

export function ReportsPage(): React.ReactElement {
  return <ModulePlaceholder icon="🧾" title="Relatórios" subtitle="Relatórios mensais" />
}
