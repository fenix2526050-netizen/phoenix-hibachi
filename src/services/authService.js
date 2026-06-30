export function currentDashboardRole() {
  return window.currentDashboardRole || window.PHX_CURRENT_ROLE || 'Guest';
}

export function canManageOrders(role = currentDashboardRole()) {
  return ['Admin', 'Manager', 'Customer Service'].includes(role);
}

export function canDownloadPdf(role = currentDashboardRole()) {
  return ['Admin', 'Manager', 'Customer Service'].includes(role);
}
