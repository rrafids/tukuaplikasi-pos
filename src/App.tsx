import { useState } from 'react'
import {
  ArchiveBoxIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  CubeIcon,
  DocumentTextIcon,
  MapPinIcon,
  TagIcon,
  ScaleIcon,
  ShoppingCartIcon,
  TrashIcon,
  ShoppingBagIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  PowerIcon,
} from '@heroicons/react/24/outline'
import Categories from './components/Categories'
import Products from './components/Products'
import UOMs from './components/UOMs'
import Locations from './components/Locations'
import ProductLocationStocks from './components/ProductLocationStocks'
import Procurements from './components/Procurements'
import Disposals from './components/Disposals'
import Sales from './components/Sales'
import StockMovements from './components/StockMovements'
import AuditTrail from './components/AuditTrail'
import Dashboard from './components/Dashboard'
import StockMonitoring from './components/StockMonitoring'
import StockOpname from './components/StockOpname'
import Users from './components/Users'
import Roles from './components/Roles'
import Login from './components/Login'
import LicenseActivation from './components/LicenseActivation'
import ToastContainer from './components/Toast'
import { ToastProvider, useToastContext } from './contexts/ToastContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LicenseProvider, useLicense } from './contexts/LicenseContext'
import { LanguageProvider, useLanguage } from './contexts/LanguageContext'
import LanguageToggle from './components/LanguageToggle'
import { getCurrentWindow } from '@tauri-apps/api/window'

type View = 'dashboard' | 'products' | 'categories' | 'uoms' | 'locations' | 'product-location-stocks' | 'procurements' | 'disposals' | 'sales' | 'stock-movements' | 'audit-trail' | 'stock-monitoring' | 'stock-opname' | 'users' | 'roles'

function AppContent() {
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const { toasts, removeToast } = useToastContext()
  const { user, logout, hasPermission, isLoading: authLoading } = useAuth()
  const { isActivated, isLoading: licenseLoading } = useLicense()
  const { t } = useLanguage()

  // Show loading if checking license or auth
  if (licenseLoading || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-slate-600">{t.common.loading}</div>
      </div>
    )
  }

  // Show license activation if not activated
  if (!isActivated) {
    return <LicenseActivation />
  }

  // Show login if not authenticated
  if (!user) {
    return <Login />
  }

  // Helper function to render menu item conditionally
  const renderMenuItem = (
    view: View,
    label: string,
    icon: React.ComponentType<{ className?: string }>,
  ) => {
    if (!hasPermission(view)) {
      return null
    }
    const Icon = icon
    return (
      <button
        onClick={() => setCurrentView(view)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${currentView === view
          ? 'bg-primary-600 text-white shadow-sm font-medium'
          : 'text-slate-600 hover:bg-slate-100 font-normal'
          }`}
      >
        <Icon
          className={`h-5 w-5 ${currentView === view ? 'text-white' : 'text-slate-600'}`}
        />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div className="h-full bg-slate-100 text-slate-900">
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white/80 shadow-sm backdrop-blur md:flex">
          <div className="shrink-0 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src="/tlog.png" alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                <div>
                  <div className="text-sm font-semibold tracking-tight">
                    {t.app.title}
                  </div>
                  <div className="text-xs text-slate-500">{user.username}</div>
                </div>
              </div>
              <LanguageToggle />
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4 text-sm">
            {/* Dashboard */}
            {renderMenuItem('dashboard', t.nav.dashboard, ChartBarIcon)}

            {/* Products Parent Menu */}
            {(hasPermission('products') ||
              hasPermission('categories') ||
              hasPermission('uoms')) && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {t.nav.productsManagement}
                  </div>
                  {renderMenuItem('products', t.nav.products, ArchiveBoxIcon)}
                  {renderMenuItem('categories', t.nav.categories, TagIcon)}
                  {renderMenuItem('uoms', t.nav.uoms, ScaleIcon)}
                </div>
              )}

            {/* Warehouse Management */}
            {(hasPermission('locations') ||
              hasPermission('product-location-stocks') ||
              hasPermission('stock-movements') ||
              hasPermission('stock-monitoring') ||
              hasPermission('stock-opname') ||
              hasPermission('procurements') ||
              hasPermission('disposals')) && (
                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {t.nav.warehouseManagement}
                  </div>
                  {renderMenuItem('locations', t.nav.locations, MapPinIcon)}
                  {renderMenuItem('product-location-stocks', t.nav.locationStocks, ArchiveBoxIcon)}
                  {renderMenuItem('stock-movements', t.nav.stockMovements, ArrowTrendingUpIcon)}
                  {renderMenuItem('stock-monitoring', t.nav.stockMonitoring, CubeIcon)}
                  {renderMenuItem('stock-opname', t.nav.stockOpname, ArchiveBoxIcon)}
                  {renderMenuItem('procurements', t.nav.procurements, ShoppingCartIcon)}
                  {renderMenuItem('disposals', t.nav.disposals, TrashIcon)}
                </div>
              )}

            {/* Orders Management */}
            {hasPermission('sales') && (
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t.nav.ordersManagement}
                </div>
                {renderMenuItem('sales', t.nav.sales, ShoppingBagIcon)}
              </div>
            )}

            {/* Audit Trail */}
            {hasPermission('audit-trail') && (
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t.nav.auditTrail}
                </div>
                {renderMenuItem('audit-trail', t.nav.auditTrail, DocumentTextIcon)}
              </div>
            )}

            {/* User Management - Only for superadmin */}
            {user.is_superadmin === 1 && (
              <div className="space-y-1">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t.nav.systemAdministration}
                </div>
                {renderMenuItem('users', t.nav.users, UserGroupIcon)}
                {renderMenuItem('roles', t.nav.roles, ShieldCheckIcon)}
              </div>
            )}
          </nav>

          <div className="shrink-0 border-t border-slate-200 px-4 py-4 space-y-2">
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span>{t.app.logout}</span>
            </button>
            <button
              onClick={async () => {
                const appWindow = getCurrentWindow()
                await appWindow.close()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              <PowerIcon className="h-5 w-5" />
              <span>{t.app.exit}</span>
            </button>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>{t.app.craftedBy}</span>
              </div>
              <span>{t.app.version}</span>
            </div>
          </div>
        </aside>

        {/* Main area */}
        {currentView === 'dashboard' ? (
          <Dashboard />
        ) : currentView === 'categories' ? (
          <Categories />
        ) : currentView === 'uoms' ? (
          <UOMs />
        ) : currentView === 'locations' ? (
          <Locations />
        ) : currentView === 'product-location-stocks' ? (
          <ProductLocationStocks />
        ) : currentView === 'procurements' ? (
          <Procurements />
        ) : currentView === 'disposals' ? (
          <Disposals />
        ) : currentView === 'sales' ? (
          <Sales />
        ) : currentView === 'stock-movements' ? (
          <StockMovements />
        ) : currentView === 'stock-monitoring' ? (
          <StockMonitoring />
        ) : currentView === 'stock-opname' ? (
          <StockOpname />
        ) : currentView === 'audit-trail' ? (
          <AuditTrail />
        ) : currentView === 'users' ? (
          <Users />
        ) : currentView === 'roles' ? (
          <Roles />
        ) : (
          <Products />
        )}
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  )
}

function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <LicenseProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </LicenseProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

export default App
