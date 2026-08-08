import { jsx as _jsx } from "react/jsx-runtime";
import { ModulePlaceholder } from '../../_shared/ModulePlaceholder';
export function FinanceDashboardPage() {
    return (_jsx(ModulePlaceholder, { icon: "\uD83D\uDCB0", title: "Finan\u00E7as \u2014 Dashboard", subtitle: "Saldo, gastos do m\u00EAs, top categorias, evolu\u00E7\u00E3o, meta", note: "Tabelas accounts/transactions/categories/budgets/investments j\u00E1 criadas. Importa\u00E7\u00E3o CSV (Nubank/Inter/Wise) e gr\u00E1ficos entram numa pr\u00F3xima sess\u00E3o." }));
}
export function TransactionsPage() {
    return (_jsx(ModulePlaceholder, { icon: "\uD83D\uDCB8", title: "Transa\u00E7\u00F5es", subtitle: "Receitas e despesas, multi-moeda BRL/JPY/USD", note: "Tabela transactions criada. CRUD e importa\u00E7\u00E3o CSV em breve." }));
}
export function BudgetPage() {
    return (_jsx(ModulePlaceholder, { icon: "\uD83D\uDCC9", title: "Or\u00E7amento", subtitle: "Or\u00E7amento mensal por categoria" }));
}
export function InvestmentsPage() {
    return _jsx(ModulePlaceholder, { icon: "\uD83D\uDCC8", title: "Investimentos", subtitle: "Posi\u00E7\u00F5es e evolu\u00E7\u00E3o" });
}
export function ReportsPage() {
    return _jsx(ModulePlaceholder, { icon: "\uD83E\uDDFE", title: "Relat\u00F3rios", subtitle: "Relat\u00F3rios mensais" });
}
