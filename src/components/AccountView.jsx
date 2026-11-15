import { useEffect, useState } from 'react';
import { LogOut, PackageCheck, ShieldCheck, User as UserIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatOrderDate, formatPrice } from '../lib/media.js';

export function AccountView({
  user,
  orders,
  wishlistCount = 0,
  authNotice = null,
  onLogin,
  onRegister,
  onAdminClaimed,
  onLogout,
  onViewOrders,
  onOpenDispatch,
  onBrowseCatalog,
}) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [setupSecret, setSetupSecret] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    api
      .getSetupStatus()
      .then((res) => setNeedsAdminSetup(Boolean(res?.needsAdminSetup)))
      .catch(() => setNeedsAdminSetup(false));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(name, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminSetupSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const adminUser = await api.setupAdmin({
        setupSecret,
        name: adminName,
        email: adminEmail,
        password: adminPassword,
      });
      setNeedsAdminSetup(false);
      setShowAdminSetup(false);
      onAdminClaimed?.(adminUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setMode('login');
    setEmail('demo@kansogoods.com');
    setPassword('demo1234');
    setError(null);
  };

  if (user) {
    const isAdmin = user.role === 'admin';

    return (
      <section className="max-w-[900px] mx-auto px-4 sm:px-6 py-12">
        <div className="kt-glass rounded-[20px] p-6 sm:p-8 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-6 mb-6 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-[14px] bg-[#F5F8FC] border border-[#DCE3ED] flex items-center justify-center text-[#315ECA]">
                {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <UserIcon className="w-5 h-5" strokeWidth={1.75} />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#101827] leading-none">
                    {user.name}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] rounded-[8px] ${
                      isAdmin
                        ? 'bg-[#101827] text-white'
                        : 'bg-[#F5F8FC] text-[#315ECA] border border-[#DCE3ED]'
                    }`}
                  >
                    {isAdmin ? 'Admin' : 'Customer'}
                  </span>
                </div>
                <p className="text-sm text-[#64748B] mt-1">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="kt-btn-secondary inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-8">
            <div className="bg-[#F5F8FC] border border-[#E2E8F0] rounded-[14px] p-4">
              <dt className="text-xs uppercase tracking-[0.08em] text-[#64748B] mb-1">Member Since</dt>
              <dd className="font-bold text-[#101827]">{formatOrderDate(user.createdAt)}</dd>
            </div>
            <div className="bg-[#F5F8FC] border border-[#E2E8F0] rounded-[14px] p-4">
              <dt className="text-xs uppercase tracking-[0.08em] text-[#64748B] mb-1">Orders Placed</dt>
              <dd className="font-mono font-bold text-[#315ECA] tabular-nums">{orders.length}</dd>
            </div>
            <div className="bg-[#F5F8FC] border border-[#E2E8F0] rounded-[14px] p-4">
              <dt className="text-xs uppercase tracking-[0.08em] text-[#64748B] mb-1">Saved Hardware</dt>
              <dd className="font-mono font-bold text-[#16A34A] tabular-nums">{wishlistCount} items</dd>
            </div>
          </dl>

          {orders.length > 0 && (
            <div className="mb-8 border-t border-[#E2E8F0] pt-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#315ECA] mb-3">
                Recent Orders
              </h2>
              <div className="divide-y divide-[#E2E8F0] bg-[#F5F8FC] border border-[#E2E8F0] rounded-[14px]">
                {orders.slice(0, 3).map((order) => (
                  <div key={order.id} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-[#101827]">#{order.orderNumber}</span>
                      <span className="text-[#64748B]">{formatOrderDate(order.createdAt)}</span>
                      <span
                        className={`font-semibold ${
                          order.status === 'Cancelled'
                            ? 'text-[#DC2626]'
                            : order.status === 'Delivered'
                              ? 'text-[#16A34A]'
                              : 'text-[#315ECA]'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-[#101827] tabular-nums">
                      {formatPrice(order.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onViewOrders}
              className="kt-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold cursor-pointer"
            >
              <PackageCheck className="w-4 h-4" />
              <span>View Full Order History</span>
            </button>
            {isAdmin && onOpenDispatch && (
              <button
                type="button"
                onClick={onOpenDispatch}
                className="px-5 py-2.5 text-xs font-semibold rounded-[12px] bg-[#101827] text-white hover:bg-[#172B4D] inline-flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#5B8DEF]" />
                <span>Open Admin Fulfillment</span>
              </button>
            )}
            <button
              type="button"
              onClick={onBrowseCatalog}
              className="kt-btn-secondary px-5 py-2.5 text-xs font-semibold cursor-pointer"
            >
              Return to Store
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-[460px] mx-auto px-4 sm:px-6 py-12">
      <div className="kt-glass rounded-[20px] p-6 sm:p-8 bg-white">
        <h1 className="font-display text-3xl font-extrabold text-[#101827] mb-1.5">
          {showAdminSetup
            ? 'First-Time Admin Setup'
            : mode === 'login'
              ? 'Sign in to Kanso Tech'
              : 'Create your Kanso Tech ID'}
        </h1>
        <p className="text-sm text-[#64748B] mb-6">
          {showAdminSetup
            ? 'Enter the one-time setup token from your server environment or startup log to claim initial admin privileges.'
            : mode === 'login'
              ? 'Access your synced wishlist, saved bag, and real-time order tracking.'
              : 'Register a customer account for persistent wishlist and fast checkout.'}
        </p>

        {!showAdminSetup && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F5F8FC] border border-[#DCE3ED] rounded-[14px] mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-[10px] transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-[#315ECA] text-white shadow-xs' : 'text-[#64748B] hover:text-[#101827]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-[10px] transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-[#315ECA] text-white shadow-xs' : 'text-[#64748B] hover:text-[#101827]'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {authNotice && !showAdminSetup && (
          <div className="mb-4 px-3.5 py-2.5 bg-[#315ECA]/10 border border-[#315ECA]/30 text-[#172B4D] text-xs font-semibold rounded-[12px]">
            {authNotice}
          </div>
        )}

        {error && (
          <div className="mb-4 px-3.5 py-2.5 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] text-xs font-medium rounded-[12px]">
            {error}
          </div>
        )}

        {showAdminSetup ? (
          <form onSubmit={handleAdminSetupSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">Admin Setup Token</label>
              <input
                type="password"
                required
                value={setupSecret}
                onChange={(e) => setSetupSecret(e.target.value)}
                placeholder="From ADMIN_SETUP_SECRET or server log"
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">Admin Name</label>
              <input
                type="text"
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Operations Lead"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">Admin Email</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@kansotech.com"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">Admin Password (8+ chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] focus:outline-none focus:border-[#315ECA]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAdminSetup(false);
                  setError(null);
                }}
                className="kt-btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="kt-btn-primary flex-1 py-2.5 px-4 text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Provisioning...' : 'Provision Admin Account'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jahnavi Chaganti"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#DCE3ED] rounded-[12px] text-[#172033] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#315ECA]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="kt-btn-primary w-full py-2.5 px-4 text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-[#E2E8F0] space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[#64748B]">Demo customer: Jahnavi Chaganti</span>
            <button
              type="button"
              onClick={handleFillDemo}
              className="text-xs font-semibold text-[#315ECA] hover:text-[#172B4D] hover:underline underline-offset-4 cursor-pointer"
            >
              Fill Demo Credentials
            </button>
          </div>
          {needsAdminSetup && !showAdminSetup && (
            <button
              type="button"
              onClick={() => {
                setShowAdminSetup(true);
                setError(null);
              }}
              className="text-xs font-semibold text-[#172B4D] hover:text-[#315ECA] underline underline-offset-4 cursor-pointer"
            >
              First-time deployment? Claim initial admin account
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
