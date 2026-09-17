// ═══════════════════════════════════════════════
// GymPro Dashboard - Main Application Logic
// ═══════════════════════════════════════════════

// ─── Auth Check ────────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    if (data.admin.username === 'admin') {
      document.getElementById('adminName').textContent = 'Fitness Hub Admin';
      document.getElementById('adminAvatar').innerHTML = '<img src="/images/fitnesshub.jpg" alt="Fitness Hub Admin">';
    } else {
      document.getElementById('adminName').textContent = data.admin.username;
      document.getElementById('adminAvatar').textContent = data.admin.username.charAt(0).toUpperCase();
    }
    loadDashboard();
    loadPackages();
  } catch { window.location.href = '/'; }
})();

// ─── Theme Toggle ──────────────────────────────
// Theme is locked to Light Mode with Dark Sidebar for premium visual balance.

// ─── Toast Notifications ──────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── HTML Sanitization ────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ─── Navigation ───────────────────────────────
const navItems = document.querySelectorAll('.nav-item[data-page]');
const pages = document.querySelectorAll('.page-section');

function navigateTo(page) {
  navItems.forEach(n => n.classList.remove('active'));
  pages.forEach(p => p.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  const section = document.getElementById(`page-${page}`);
  if (nav) nav.classList.add('active');
  if (section) section.classList.add('active');
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  if (page === 'overview') loadDashboard();
  if (page === 'members') {
    loadPackages();
    loadMembers();
  }
  if (page === 'attendance') loadAttendancePage();
  if (page === 'notifications') loadNotifications();
  if (page === 'logistics') loadLogistics();
  if (page === 'dues') loadDuesPage();
  if (page === 'reports') loadReportsPage();
  if (page === 'settings') loadSettingsPage();
}

navItems.forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// Mobile toggle
document.getElementById('mobileToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ─── Logout ───────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

// ─── Reusable Pagination Navigation Builder ────
function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

function buildPaginationNav({ currentPage, totalPages, onPageChange, showFirstLast = true }) {
  const frag = document.createDocumentFragment();
  if (totalPages <= 1) return frag;

  const makeBtn = (text, page, disabled, isActive = false, title = '') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pagination-btn ${isActive ? 'active' : ''}`;
    btn.innerHTML = text;
    if (title) btn.title = title;
    if (disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        onPageChange(page);
      });
    }
    return btn;
  };

  // First page
  if (showFirstLast) {
    frag.appendChild(makeBtn('«', 1, currentPage === 1, false, 'First Page'));
  }

  // Prev
  frag.appendChild(makeBtn('‹', currentPage - 1, currentPage === 1, false, 'Previous Page'));

  // Page Numbers & Ellipses
  const pages = getPageNumbers(currentPage, totalPages);
  pages.forEach(p => {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'pagination-ellipsis';
      span.textContent = '…';
      frag.appendChild(span);
    } else {
      frag.appendChild(makeBtn(p, p, false, p === currentPage, `Page ${p}`));
    }
  });

  // Next
  frag.appendChild(makeBtn('›', currentPage + 1, currentPage === totalPages, false, 'Next Page'));

  // Last page
  if (showFirstLast) {
    frag.appendChild(makeBtn('»', totalPages, currentPage === totalPages, false, 'Last Page'));
  }

  return frag;
}

// ═══════════════════════════════════════════════
// DASHBOARD / OVERVIEW
// ═══════════════════════════════════════════════

let allExpiringMembers = [];
let expiringCurrentPage = 1;
const expiringPageSize = 5;

function renderExpiringList() {
  const container = document.getElementById('expiringList');
  const footer = document.getElementById('expiringPaginationFooter');
  const badge = document.getElementById('expiringBadge');

  if (badge) {
    if (allExpiringMembers.length > 0) {
      badge.textContent = `${allExpiringMembers.length} Expiring Soon`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (allExpiringMembers.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><h3>All good!</h3><p>No memberships expiring within 7 days</p></div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(allExpiringMembers.length / expiringPageSize) || 1;
  expiringCurrentPage = Math.min(Math.max(1, expiringCurrentPage), totalPages);

  const startIdx = (expiringCurrentPage - 1) * expiringPageSize;
  const endIdx = Math.min(startIdx + expiringPageSize, allExpiringMembers.length);
  const pagedList = allExpiringMembers.slice(startIdx, endIdx);

  container.innerHTML = pagedList.map(m => `
    <div class="notif-item">
      <div class="notif-icon warning">⏰</div>
      <div class="notif-content">
        <div class="name">${escapeHtml(m.full_name)}</div>
        <div class="message">Membership expires on ${formatDate(m.expiry_date)} (${m.days_remaining} day${m.days_remaining !== 1 ? 's' : ''} remaining)</div>
        <div class="time">📱 ${m.phone}</div>
      </div>
      <button class="btn btn-success btn-sm" onclick="sendNotification(${m.id}, 'expiry_warning')">📨 Notify</button>
    </div>
  `).join('');

  if (footer) {
    if (allExpiringMembers.length > expiringPageSize) {
      footer.style.display = 'flex';
      document.getElementById('expiringPageStart').textContent = startIdx + 1;
      document.getElementById('expiringPageEnd').textContent = endIdx;
      document.getElementById('expiringTotalCount').textContent = allExpiringMembers.length;

      const navContainer = document.getElementById('expiringPaginationNav');
      navContainer.innerHTML = '';
      navContainer.appendChild(buildPaginationNav({
        currentPage: expiringCurrentPage,
        totalPages: totalPages,
        onPageChange: (newPage) => {
          expiringCurrentPage = newPage;
          renderExpiringList();
        },
        showFirstLast: false
      }));
    } else {
      footer.style.display = 'none';
    }
  }
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const stats = await res.json();
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statActive').textContent = stats.active;
    document.getElementById('statExpiring').textContent = stats.expiringSoon;
    document.getElementById('statExpired').textContent = stats.expired;
    document.getElementById('statTodayAttendance').textContent = stats.todayAttendance || 0;

    // Load expiring soon list
    const expRes = await fetch('/api/members?status=active');
    const members = await expRes.json();
    allExpiringMembers = members.filter(m => m.days_remaining >= 0 && m.days_remaining <= 7)
      .sort((a, b) => (a.days_remaining || 0) - (b.days_remaining || 0));
    expiringCurrentPage = 1;
    renderExpiringList();
  } catch (err) {
    showToast('Failed to load dashboard', 'error');
  }
}

// ═══════════════════════════════════════════════
// MEMBERS CRUD
// ═══════════════════════════════════════════════

let allMembersList = [];
let membersCurrentPage = 1;
let membersPageSize = 10;

let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadMembers(true), 300);
});
document.getElementById('statusFilter').addEventListener('change', () => loadMembers(true));

document.getElementById('membersPageSizeSelect')?.addEventListener('change', (e) => {
  membersPageSize = parseInt(e.target.value, 10) || 10;
  membersCurrentPage = 1;
  renderMembersTable();
});

async function loadMembers(resetPage = false) {
  if (resetPage) {
    membersCurrentPage = 1;
  }
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  try {
    const res = await fetch(`/api/members?search=${encodeURIComponent(search)}&status=${status}`);
    allMembersList = await res.json();
    renderMembersTable();
  } catch { showToast('Failed to load members', 'error'); }
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

function renderMembersTable() {
  const tbody = document.getElementById('membersBody');
  const empty = document.getElementById('emptyState');
  const container = document.getElementById('membersTableContainer');
  const footer = document.getElementById('membersPaginationFooter');

  if (!allMembersList || allMembersList.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    container.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'block';

  const totalPages = Math.ceil(allMembersList.length / membersPageSize) || 1;
  membersCurrentPage = Math.min(Math.max(1, membersCurrentPage), totalPages);

  const startIdx = (membersCurrentPage - 1) * membersPageSize;
  const endIdx = Math.min(startIdx + membersPageSize, allMembersList.length);
  const pagedMembers = allMembersList.slice(startIdx, endIdx);

  tbody.innerHTML = pagedMembers.map(m => {
    let statusClass = m.status;
    if (m.status === 'active' && m.days_remaining <= 7) statusClass = 'expiring';
    const statusLabel = statusClass === 'expiring' ? 'Expiring' : m.status;

    let paymentBadge = '';
    if (m.outstanding_balance === 0) {
      paymentBadge = `<span class="badge active" style="background:var(--green); color:white;">Paid</span>`;
    } else {
      if (m.latest_payment_status === 'OVERDUE') {
        paymentBadge = `<span class="badge expired" style="background:#ef4444; color:white;">Overdue: NPR ${m.outstanding_balance}</span>`;
      } else if (m.total_paid > 0) {
        paymentBadge = `<span class="badge warning" style="background:#f59e0b; color:white;">Due: NPR ${m.outstanding_balance}</span>`;
      } else {
        paymentBadge = `<span class="badge" style="background:#64748b; color:white;">Unpaid: NPR ${m.outstanding_balance}</span>`;
      }
    }

    return `
    <tr class="clickable-row">
      <td onclick="viewMemberProfile(${m.id})">
        <div class="member-info-cell">
          <div class="member-avatar-container">
            ${m.avatar_path 
              ? `<img src="${m.avatar_path}" class="member-avatar-img" alt="${escapeHtml(m.full_name)}">`
              : `<div class="member-avatar-initials">${getInitials(m.full_name)}</div>`
            }
          </div>
          <div>
            <div class="member-name">${escapeHtml(m.full_name)}</div>
            ${m.email ? `<div class="member-phone">${escapeHtml(m.email)}</div>` : ''}
          </div>
        </div>
      </td>
      <td onclick="viewMemberProfile(${m.id})">${escapeHtml(m.phone)}</td>
      <td onclick="viewMemberProfile(${m.id})"><span class="badge active">${m.plan_type}</span></td>
      <td onclick="viewMemberProfile(${m.id})">${formatDate(m.join_date)}</td>
      <td onclick="viewMemberProfile(${m.id})">${formatDate(m.expiry_date)}</td>
      <td onclick="viewMemberProfile(${m.id})"><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td onclick="viewMemberProfile(${m.id})">${paymentBadge}</td>
      <td>
        <div class="actions-cell">
          <button class="action-btn" title="Edit" onclick="editMember(${m.id})">✏️</button>
          <button class="action-btn notify" title="Send Notification" onclick="sendNotification(${m.id}, 'expiry_warning')">📨</button>
          ${(m.is_system_protected === 1 || m.is_system_protected === '1')
            ? `<button class="action-btn delete" title="Protected Member" style="opacity: 0.4; cursor: not-allowed;" disabled>🔒</button>`
            : `<button class="action-btn delete" title="Delete" onclick="confirmDelete(${m.id}, '${escapeHtml(m.full_name)}')">🗑️</button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');

  if (footer) {
    document.getElementById('membersPageStart').textContent = startIdx + 1;
    document.getElementById('membersPageEnd').textContent = endIdx;
    document.getElementById('membersTotalCount').textContent = allMembersList.length;

    const navContainer = document.getElementById('membersPaginationNav');
    navContainer.innerHTML = '';
    navContainer.appendChild(buildPaginationNav({
      currentPage: membersCurrentPage,
      totalPages: totalPages,
      onPageChange: (newPage) => {
        membersCurrentPage = newPage;
        renderMembersTable();
        const tableCard = container.closest('.section-card');
        if (tableCard) {
          const rect = tableCard.getBoundingClientRect();
          if (rect.top < 0) {
            tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      },
      showFirstLast: true
    }));
  }
}

function renderMembers(members) {
  allMembersList = members || [];
  renderMembersTable();
}

// ─── Add/Edit Modal ───────────────────────────
const modal = document.getElementById('memberModal');
const form = document.getElementById('memberForm');

document.getElementById('addMemberBtn').addEventListener('click', () => {
  document.getElementById('modalTitle').textContent = 'Add New Member';
  document.getElementById('modalSubmit').textContent = 'Add Member';
  form.reset();
  document.getElementById('memberId').value = '';
  document.getElementById('memberJoinDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('memberDuration').value = '1';
  document.getElementById('memberPlan').value = 'Monthly';
  document.getElementById('memberDOB').value = '';
  document.getElementById('memberGender').value = 'male';
  document.getElementById('memberEmergencyName').value = '';
  document.getElementById('memberEmergencyPhone').value = '';
  document.getElementById('memberAmountPaid').value = '0';
  document.getElementById('memberPaymentMethod').value = 'Cash';
  document.getElementById('memberTransactionRef').value = '';
  document.getElementById('memberPaymentDueDate').value = '';
  document.getElementById('onboardingPaymentSection').style.display = 'block';
  calculateExpiryDate();
  clearMemberPhoto();
  modal.classList.add('active');
});

function closeMemberModal() {
  modal.classList.remove('active');
  stopWebcam();
}

document.getElementById('modalClose').addEventListener('click', () => closeMemberModal());
document.getElementById('modalCancel').addEventListener('click', () => closeMemberModal());
modal.addEventListener('click', (e) => { if (e.target === modal) closeMemberModal(); });

// ─── Auto-calculate Expiry Date ───────────────────
function calculateExpiryDate() {
  const joinDateStr = document.getElementById('memberJoinDate').value;
  const durationStr = document.getElementById('memberDuration').value;
  
  if (durationStr === 'custom') {
    return;
  }
  
  if (joinDateStr && durationStr) {
    const joinDate = new Date(joinDateStr);
    const duration = parseInt(durationStr, 10);
    
    joinDate.setMonth(joinDate.getMonth() + duration);
    
    const expiryDateStr = joinDate.toISOString().split('T')[0];
    document.getElementById('memberExpiryDate').value = expiryDateStr;
  }
}

function handleExpiryDateManualChange() {
  document.getElementById('memberDuration').value = 'custom';
}

document.getElementById('memberJoinDate').addEventListener('change', calculateExpiryDate);

// Synchronize Duration changes to Plan Type selection
document.getElementById('memberDuration').addEventListener('change', () => {
  const durationVal = document.getElementById('memberDuration').value;
  const planSelect = document.getElementById('memberPlan');
  
  if (durationVal !== 'custom') {
    const duration = parseInt(durationVal, 10);
    const matchedPkg = customPackages.find(p => p.duration_months === duration);
    if (matchedPkg) {
      planSelect.value = matchedPkg.name;
    } else {
      if (duration === 1) planSelect.value = 'Monthly';
      else if (duration === 3) planSelect.value = 'Quarterly';
      else if (duration === 6) planSelect.value = 'Half-Yearly';
      else if (duration === 12) planSelect.value = 'Yearly';
    }
  }
  calculateExpiryDate();
});

// Synchronize Plan Type changes to Duration selection
document.getElementById('memberPlan').addEventListener('change', () => {
  const planVal = document.getElementById('memberPlan').value;
  const durationSelect = document.getElementById('memberDuration');
  
  if (planVal === 'Monthly') {
    durationSelect.value = '1';
  } else if (planVal === 'Quarterly') {
    durationSelect.value = '3';
  } else if (planVal === 'Half-Yearly') {
    durationSelect.value = '6';
  } else if (planVal === 'Yearly') {
    durationSelect.value = '12';
  } else {
    const pkg = customPackages.find(p => p.name === planVal);
    if (pkg) {
      let optionExists = false;
      for (let i = 0; i < durationSelect.options.length; i++) {
        if (durationSelect.options[i].value == pkg.duration_months) {
          optionExists = true;
          break;
        }
      }
      if (!optionExists) {
        const newOpt = document.createElement('option');
        newOpt.value = pkg.duration_months;
        newOpt.textContent = `${pkg.duration_months} Months`;
        durationSelect.appendChild(newOpt);
      }
      durationSelect.value = pkg.duration_months.toString();
    }
  }
  calculateExpiryDate();
});

document.getElementById('memberExpiryDate').addEventListener('change', handleExpiryDateManualChange);

async function editMember(id) {
  try {
    const res = await fetch(`/api/members/${id}`);
    const m = await res.json();
    document.getElementById('modalTitle').textContent = 'Edit Member';
    document.getElementById('modalSubmit').textContent = 'Save Changes';
    document.getElementById('memberId').value = m.id;
    document.getElementById('memberName').value = m.full_name;
    document.getElementById('memberPhone').value = m.phone;
    document.getElementById('memberEmail').value = m.email || '';
    document.getElementById('memberAddress').value = m.address || '';
    document.getElementById('memberJoinDate').value = m.join_date;
    document.getElementById('memberDuration').value = m.duration_months;
    document.getElementById('memberExpiryDate').value = m.expiry_date || '';
    document.getElementById('memberPlan').value = m.plan_type;
    document.getElementById('memberNotes').value = m.notes || '';
    
    // Custom profile fields
    document.getElementById('memberDOB').value = m.date_of_birth || '';
    document.getElementById('memberGender').value = m.gender || 'male';
    document.getElementById('memberEmergencyName').value = m.emergency_contact_name || '';
    document.getElementById('memberEmergencyPhone').value = m.emergency_contact_phone || '';
    
    // Hide payment fields since they are only for new onboarding
    document.getElementById('onboardingPaymentSection').style.display = 'none';
    
    setMemberPhotoPreview(m.avatar_path, m.full_name);
    
    modal.classList.add('active');
  } catch { showToast('Failed to load member details', 'error'); }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('memberId').value;
  
  let durationVal = document.getElementById('memberDuration').value;
  let duration_months = 1;
  if (durationVal === 'custom') {
    const start = new Date(document.getElementById('memberJoinDate').value);
    const end = new Date(document.getElementById('memberExpiryDate').value);
    if (!isNaN(start) && !isNaN(end)) {
      duration_months = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30)));
    }
  } else {
    duration_months = parseInt(durationVal, 10);
  }

  const body = {
    full_name: document.getElementById('memberName').value.trim(),
    phone: document.getElementById('memberPhone').value.trim(),
    email: document.getElementById('memberEmail').value.trim(),
    address: document.getElementById('memberAddress').value.trim(),
    join_date: document.getElementById('memberJoinDate').value,
    duration_months: duration_months,
    expiry_date: document.getElementById('memberExpiryDate').value,
    plan_type: document.getElementById('memberPlan').value,
    notes: document.getElementById('memberNotes').value.trim(),
    
    // Custom profile fields
    date_of_birth: document.getElementById('memberDOB').value || null,
    gender: document.getElementById('memberGender').value,
    emergency_contact_name: document.getElementById('memberEmergencyName').value.trim(),
    emergency_contact_phone: document.getElementById('memberEmergencyPhone').value.trim()
  };

  if (!id) {
    // Initial payment details on onboarding
    body.amount_paid_initial = parseFloat(document.getElementById('memberAmountPaid').value) || 0;
    body.payment_method = document.getElementById('memberPaymentMethod').value;
    body.transaction_reference = document.getElementById('memberTransactionRef').value.trim();
    body.payment_due_date = document.getElementById('memberPaymentDueDate').value || null;
  }

  if (memberPhotoCleared) {
    body.avatar_base64 = '';
  } else if (memberPhotoBase64) {
    body.avatar_base64 = memberPhotoBase64;
  }

  try {
    const url = id ? `/api/members/${id}` : '/api/members';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(id ? 'Member updated successfully!' : 'New member added successfully!');
    closeMemberModal();
    
    if (id) {
      viewMemberProfile(id); // Reload profile page if editing from profile
    } else {
      loadMembers();
    }
    loadDashboard();
  } catch (err) { showToast(err.message || 'Failed to save member', 'error'); }
});

// ─── Delete Confirmation ──────────────────────
let deleteId = null;
const confirmDlg = document.getElementById('confirmDialog');

function confirmDelete(id, name) {
  if (name && ['saurav kunwar', 'ashim pandey'].includes(name.trim().toLowerCase())) {
    showToast('This member is protected and cannot be deleted.', 'error');
    return;
  }
  deleteId = id;
  document.getElementById('confirmTitle').textContent = `Delete ${name}?`;
  document.getElementById('confirmMessage').textContent = 'This will permanently remove this member and their data.';
  confirmDlg.classList.add('active');
}

document.getElementById('confirmCancel').addEventListener('click', () => confirmDlg.classList.remove('active'));
confirmDlg.addEventListener('click', (e) => { if (e.target === confirmDlg) confirmDlg.classList.remove('active'); });

let confirmCallback = null;

document.getElementById('confirmOk').addEventListener('click', async () => {
  if (confirmCallback) {
    await confirmCallback();
    confirmCallback = null;
    confirmDlg.classList.remove('active');
    return;
  }
  if (!deleteId) return;
  try {
    const res = await fetch(`/api/members/${deleteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Member deleted successfully');
    confirmDlg.classList.remove('active');
    deleteId = null;
    loadMembers();
    loadDashboard();
  } catch { showToast('Failed to delete member', 'error'); }
});

// ─── Send Notification ────────────────────────
async function sendNotification(id, type) {
  try {
    const res = await fetch(`/api/members/${id}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message || 'Notification sent!');
    loadNotifications();
  } catch (err) { showToast(err.message || 'Failed to send notification', 'error'); }
}

// ═══════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════

document.getElementById('notifFilter')?.addEventListener('change', () => loadNotifications());

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    let notifs = await res.json();
    const container = document.getElementById('notificationsList');
    const empty = document.getElementById('emptyNotifications');

    // Apply Filter
    const filter = document.getElementById('notifFilter').value;
    if (filter !== 'all') {
      notifs = notifs.filter(n => n.status === filter);
    }

    if (notifs.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    container.innerHTML = notifs.map(n => {
      // Determine styling based on type and status
      let iconClass = 'success';
      let iconEmoji = '📨';
      let typeClass = 'type-success';
      
      if (n.status === 'failed') {
        iconClass = 'expired';
        iconEmoji = '❌';
        typeClass = 'type-expired';
      } else if (n.type === 'expired') {
        iconClass = 'warning';
        iconEmoji = '⚠️';
        typeClass = 'type-warning';
      }

      // Calculate time ago
      const sentTime = new Date(n.sent_at);
      const now = new Date();
      const diffMs = now - sentTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      let timeStr = '';
      if (diffMins < 1) timeStr = 'Just now';
      else if (diffMins < 60) timeStr = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      else if (diffHours < 24) timeStr = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      else timeStr = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

      return `
      <div class="notif-item ${typeClass} slide-up">
        <div class="notif-icon ${iconClass}">${iconEmoji}</div>
        <div class="notif-content">
          <div class="header">
            <div class="name">${escapeHtml(n.full_name)} <span class="badge ${n.status}">${n.status}</span></div>
            <div style="display:flex; align-items:center; gap: 12px;">
              <div class="time">🕒 ${timeStr}</div>
              <button class="action-btn delete" style="width:28px; height:28px; font-size:12px;" onclick="deleteNotification(${n.id})" title="Delete Notification">🗑️</button>
            </div>
          </div>
          <div class="message">${escapeHtml(n.message)}</div>
          <div class="footer">
            <div class="phone">📱 ${n.phone}</div>
            <div class="time" style="font-size: 11px; color: var(--text-muted); border: none; padding: 0;">${sentTime.toLocaleString()}</div>
          </div>
        </div>
      </div>
      `;
    }).join('');
  } catch { showToast('Failed to load notifications', 'error'); }
}

async function deleteNotification(id) {
  if (!confirm('Are you sure you want to delete this notification?')) return;
  try {
    const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Notification deleted successfully');
    loadNotifications();
  } catch { showToast('Failed to delete notification', 'error'); }
}

// ═══════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════

let currentAttendanceDate = new Date().toISOString().split('T')[0];
let currentShiftFilter = 'all';

async function loadAttendancePage() {
  await loadAttendanceSummary();
  await loadAttendance();
  setupCheckinSearch();
}

async function loadAttendanceSummary() {
  try {
    const res = await fetch('/api/attendance/summary');
    const summary = await res.json();
    const tabsContainer = document.getElementById('dateTabs');

    // Update today's mini stats
    if (summary.length > 0) {
      const today = summary[0];
      document.getElementById('attendMorning').textContent = today.morning;
      document.getElementById('attendDay').textContent = today.day;
      document.getElementById('attendTotal').textContent = today.total;
    }

    // Render date tabs
    tabsContainer.innerHTML = summary.map((s, i) => {
      const d = new Date(s.date + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const isActive = s.date === currentAttendanceDate;
      const isToday = i === 0;
      return `
        <button class="date-tab ${isActive ? 'active' : ''}" data-date="${s.date}">
          <span class="date-tab-day">${isToday ? 'Today' : dayName}</span>
          <span class="date-tab-num">${dayNum}</span>
          <span class="date-tab-month">${month}</span>
          <span class="date-tab-count">${s.total} ✓</span>
        </button>
      `;
    }).join('');

    // Attach click handlers
    tabsContainer.querySelectorAll('.date-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentAttendanceDate = tab.dataset.date;
        tabsContainer.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadAttendance();
      });
    });
  } catch { showToast('Failed to load attendance summary', 'error'); }
}

async function loadAttendance() {
  try {
    const res = await fetch(`/api/attendance?date=${currentAttendanceDate}&shift=${currentShiftFilter}`);
    const records = await res.json();
    const tbody = document.getElementById('attendanceBody');
    const empty = document.getElementById('emptyAttendance');
    const tableContainer = document.getElementById('attendanceTableContainer');

    if (records.length === 0) {
      tbody.innerHTML = '';
      tableContainer.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    tableContainer.style.display = 'block';

    tbody.innerHTML = records.map((r, idx) => {
      const time = new Date(r.check_in_time.replace(' ', 'T'));
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const shiftClass = r.shift === 'morning' ? 'shift-morning' : 'shift-day';
      const shiftLabel = r.shift === 'morning' ? '🌅 Morning' : '☀️ Day';

      return `
        <tr class="fade-in" style="animation-delay:${idx * 0.03}s">
          <td>${idx + 1}</td>
          <td><div class="member-name">${escapeHtml(r.full_name)}</div></td>
          <td>${escapeHtml(r.phone)}</td>
          <td>${timeStr}</td>
          <td><span class="badge ${shiftClass}">${shiftLabel}</span></td>
          <td class="actions-cell">
            <button class="action-btn delete btn-delete-attendance" data-id="${r.id}" title="Remove Record">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach delete handlers
    tbody.querySelectorAll('.btn-delete-attendance').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to remove this attendance record?')) {
          try {
            const res = await fetch(`/api/attendance/${btn.dataset.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
              showToast('Attendance record removed', 'success');
              loadAttendanceSummary(); // Reload to update counts and table
            } else {
              showToast(data.message || 'Failed to remove record', 'error');
            }
          } catch (err) {
            showToast('Failed to connect to server', 'error');
          }
        }
      });
    });
  } catch { showToast('Failed to load attendance', 'error'); }
}

// Shift filter buttons
document.querySelectorAll('.shift-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentShiftFilter = btn.dataset.shift;
    loadAttendance();
  });
});

// Check-in search with autocomplete
let checkinSearchTimeout;
let allMembersCache = [];

function setupCheckinSearch() {
  const input = document.getElementById('checkinSearch');
  const suggestions = document.getElementById('checkinSuggestions');

  input.addEventListener('input', () => {
    clearTimeout(checkinSearchTimeout);
    const query = input.value.trim();
    document.getElementById('checkinMemberId').value = '';

    if (query.length < 2) {
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
      return;
    }

    checkinSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(query)}&status=all`);
        allMembersCache = await res.json();

        if (allMembersCache.length === 0) {
          suggestions.innerHTML = '<div class="suggestion-item no-result">No members found</div>';
          suggestions.style.display = 'block';
          return;
        }

        suggestions.innerHTML = allMembersCache.slice(0, 8).map(m => `
          <div class="suggestion-item" data-id="${m.id}" data-name="${escapeHtml(m.full_name)}">
            <span class="suggestion-name">${escapeHtml(m.full_name)}</span>
            <span class="suggestion-phone">${m.phone}</span>
            <span class="badge ${m.status}" style="font-size:10px;">${m.status}</span>
          </div>
        `).join('');
        suggestions.style.display = 'block';

        suggestions.querySelectorAll('.suggestion-item[data-id]').forEach(item => {
          item.addEventListener('click', () => {
            input.value = item.dataset.name;
            document.getElementById('checkinMemberId').value = item.dataset.id;
            suggestions.style.display = 'none';
          });
        });
      } catch { suggestions.style.display = 'none'; }
    }, 250);
  });

  // Hide suggestions on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.checkin-form')) {
      suggestions.style.display = 'none';
    }
  });
}

// Sync Device button
document.getElementById('syncHikvisionBtn').addEventListener('click', async () => {
  const btn = document.getElementById('syncHikvisionBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Syncing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/hikvision/sync');
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Successfully synced attendance from device', 'success');
      loadAttendanceSummary(); // Reload to show new entries
    } else {
      showToast(data.message || 'Failed to sync device', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

// Check-in button
document.getElementById('checkinBtn').addEventListener('click', async () => {
  const memberId = document.getElementById('checkinMemberId').value;
  const searchVal = document.getElementById('checkinSearch').value.trim();

  if (!memberId && !searchVal) {
    showToast('Please search and select a member first', 'error');
    return;
  }

  const body = memberId ? { member_id: parseInt(memberId) } : { phone: searchVal };

  try {
    const res = await fetch('/api/attendance/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Check-in failed', res.status === 409 ? 'info' : 'error');
      return;
    }

    showToast(data.message || 'Checked in successfully!');
    document.getElementById('checkinSearch').value = '';
    document.getElementById('checkinMemberId').value = '';
    document.getElementById('checkinSuggestions').style.display = 'none';

    // Refresh attendance data
    await loadAttendanceSummary();
    await loadAttendance();
  } catch { showToast('Failed to check in member', 'error'); }
});

// ═══════════════════════════════════════════════
// SETTINGS - Change Password
// ═══════════════════════════════════════════════

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Password updated successfully!');
    e.target.reset();
  } catch (err) { showToast(err.message || 'Failed to update password', 'error'); }
});

// ═══════════════════════════════════════════════
// SETTINGS - Hikvision Hardware
// ═══════════════════════════════════════════════

async function loadHikvisionSettings() {
  try {
    const res = await fetch('/api/hikvision/settings');
    const config = await res.json();
    if (config.ip) document.getElementById('hikIp').value = config.ip;
    if (config.port) document.getElementById('hikPort').value = config.port;
    if (config.username) document.getElementById('hikUsername').value = config.username;
    if (config.password) document.getElementById('hikPassword').value = config.password;
  } catch (err) {
    console.error('Failed to load Hikvision settings', err);
  }
}

async function loadSmsDiagnostics() {
  try {
    const res = await fetch('/api/sms/diagnose');
    const data = await res.json();
    document.getElementById('diagnoseIp').textContent = data.publicIp || 'Unknown';
  } catch (err) {
    document.getElementById('diagnoseIp').textContent = 'Error loading IP';
  }
}

async function loadSmsSettings() {
  try {
    const res = await fetch('/api/sms/settings');
    const data = await res.json();
    if (data.token) document.getElementById('smsAuthToken').value = data.token;
  } catch (err) {
    console.error('Failed to load SMS settings', err);
  }
}

// Load settings when the settings page is opened
document.getElementById('nav-settings').addEventListener('click', () => {
  loadHikvisionSettings();
  loadSmsSettings();
  loadSmsDiagnostics();
  loadPackages();
});

document.getElementById('smsSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('smsAuthToken').value;

  try {
    const res = await fetch('/api/sms/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save SMS settings');
    showToast('Aakash SMS Token saved successfully!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save SMS settings', 'error');
  }
});

document.getElementById('hikvisionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ip = document.getElementById('hikIp').value.trim();
  const port = document.getElementById('hikPort').value.trim();
  const username = document.getElementById('hikUsername').value.trim();
  const password = document.getElementById('hikPassword').value;

  try {
    const res = await fetch('/api/hikvision/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port, username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message);
    showToast('Hikvision settings saved successfully!');
  } catch (err) {
    showToast(err.message || 'Failed to save settings', 'error');
  }
});

document.getElementById('hikTestBtn').addEventListener('click', async () => {
  const ip = document.getElementById('hikIp').value.trim();
  const port = document.getElementById('hikPort').value.trim();
  const username = document.getElementById('hikUsername').value.trim();
  const password = document.getElementById('hikPassword').value;

  if (!ip) return showToast('Device IP is required to test connection', 'error');

  const btn = document.getElementById('hikTestBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Testing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/hikvision/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port, username, password })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Connection successful!', 'success');
    } else {
      showToast(data.message || 'Connection failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});


// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toTitleCase(str) {
  if (!str) return '';
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// ─── Real-Time Attendance via SSE ──────────────
const evtSource = new EventSource('/api/attendance/stream');
evtSource.onmessage = function(event) {
  try {
    const data = JSON.parse(event.data);
    const memberName = toTitleCase(data.member_name);
    if (data.duplicate) {
      showToast(`${memberName} already checked in for ${data.shift} shift`, 'info');
    } else {
      showToast(`${memberName} checked in! (${data.shift} shift)`, 'success');
      
      // If we are on the attendance page, refresh the list
      const attendancePage = document.getElementById('page-attendance');
      if (attendancePage && attendancePage.classList.contains('active')) {
        loadAttendanceSummary();
        loadAttendance();
      }
      
      // If on overview page, refresh dashboard stats
      const overviewPage = document.getElementById('page-overview');
      if (overviewPage && overviewPage.classList.contains('active')) {
        loadDashboard();
      }
    }
  } catch (err) {
    console.error('Error parsing SSE data:', err);
  }
};

// ═══════════════════════════════════════════════
// SETTINGS - Aakash SMS Diagnostics
// ═══════════════════════════════════════════════

document.getElementById('smsDiagnoseBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('diagnoseResult');
  resultDiv.style.display = 'block';
  resultDiv.style.background = 'rgba(255, 255, 255, 0.05)';
  resultDiv.style.borderLeft = '4px solid var(--purple)';
  resultDiv.style.color = 'var(--text-light)';
  resultDiv.innerHTML = '⏳ Running server diagnostic check...';

  try {
    const res = await fetch('/api/sms/diagnose');
    const data = await res.json();

    let report = `<strong>AAKASH SMS DIAGNOSTIC REPORT</strong>\n`;
    report += `========================================\n`;
    report += `📡 Gym Computer Public IP: <span style="color:var(--purple); font-weight:bold;">${data.publicIp}</span>\n`;
    report += `🔑 Env Token Status:      ${data.configured ? '✅ LOADED' : '❌ NOT LOADED (.env missing or empty)'}\n`;
    if (data.configured) {
      report += `🔑 Token Preview:          ${data.tokenPreview}\n`;
    }
    report += `========================================\n`;
    report += `📝 <strong>Troubleshooting Steps:</strong>\n`;
    report += `1. Open your <strong>Aakash SMS Dashboard</strong> in a browser.\n`;
    report += `2. Navigate to your IP whitelisting settings.\n`;
    report += `3. Add this exact IP address: <span style="color:var(--purple); font-weight:bold; font-size:14px; background:rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${data.publicIp}</span>\n`;
    report += `4. Click Save/Whitelist IP.\n`;
    report += `5. Try sending a Test SMS below to verify it works!`;

    resultDiv.innerHTML = report;
  } catch (err) {
    resultDiv.innerHTML = `<span style="color:var(--red);">❌ Diagnostic failed: ${err.message}</span>`;
  }
});

document.getElementById('smsTestBtn').addEventListener('click', async () => {
  const phone = prompt('Enter a phone number to send a diagnostic test SMS (e.g., 98XXXXXXXX):');
  if (!phone) return;

  const resultDiv = document.getElementById('diagnoseResult');
  resultDiv.style.display = 'block';
  resultDiv.style.background = 'rgba(255, 255, 255, 0.05)';
  resultDiv.style.borderLeft = '4px solid var(--yellow)';
  resultDiv.style.color = 'var(--text-light)';
  resultDiv.innerHTML = '⏳ Initiating test SMS...';

  try {
    const res = await fetch('/api/sms/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      resultDiv.style.borderLeft = '4px solid var(--green)';
      resultDiv.innerHTML = `<span style="color:var(--green); font-weight:bold;">✅ SMS SENT SUCCESSFULLY!</span>\n\n` +
        `Response from Aakash SMS API:\n` +
        `----------------------------------------\n` +
        JSON.stringify(data.details, null, 2);
      showToast('Test SMS sent successfully!', 'success');
    } else {
      resultDiv.style.borderLeft = '4px solid var(--red)';
      let errMsg = data.error || 'Connection failed';
      let detailsText = data.details ? JSON.stringify(data.details, null, 2) : '';

      resultDiv.innerHTML = `<span style="color:var(--red); font-weight:bold;">❌ SMS SENDING FAILED</span>\n` +
        `Error: <span style="font-weight:bold; color:var(--red);">${errMsg}</span>\n\n` +
        `💡 <strong>Likely cause:</strong> Your current Gym Computer public IP is not whitelisted on your Aakash SMS dashboard.\n` +
        `Please copy the IP at the top and whitelist it in your Aakash SMS panel.\n\n` +
        (detailsText ? `API Response Details:\n----------------------------------------\n${detailsText}` : '');
      
      showToast(errMsg, 'error');
    }
  } catch (err) {
    resultDiv.style.borderLeft = '4px solid var(--red)';
    resultDiv.innerHTML = `<span style="color:var(--red); font-weight:bold;">❌ CONNECTION ERROR</span>\n` +
      `Failed to connect to the backend server or Aakash SMS API: ${err.message}`;
    showToast('Failed to connect to server', 'error');
  }
});

// ─── Initial Load ─────────────────────────────
loadDashboard();

// ═══════════════════════════════════════════════
// FLOATING CHATBOT WIDGET
// ═══════════════════════════════════════════════
(function() {
  const trigger = document.getElementById('chatbotTrigger');
  const windowEl = document.getElementById('chatbotWindow');
  const closeBtn = document.getElementById('chatbotClose');
  const sendBtn = document.getElementById('chatbotSend');
  const inputEl = document.getElementById('chatbotInput');
  const messagesContainer = document.getElementById('chatbotMessages');

  let history = [
    { role: 'assistant', content: 'Hello! I am your Fitness Hub AI Assistant. How can I help you manage your gym today?' }
  ];

  // Toggle chat window visibility
  trigger.addEventListener('click', () => {
    windowEl.classList.toggle('open');
    if (windowEl.classList.contains('open')) {
      inputEl.focus();
      scrollToBottom();
    }
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    windowEl.classList.remove('open');
  });

  // Scroll messages to bottom
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Escape HTML helper
  function safeEscape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Append a message to UI
  function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = safeEscape(content).replace(/\n/g, '<br>');
    
    msgDiv.appendChild(contentDiv);
    messagesContainer.appendChild(msgDiv);
    scrollToBottom();
  }

  // Send message implementation
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    // Append User message
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    inputEl.value = '';
    
    // Show typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.id = 'chatbotTypingIndicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(typingIndicator);
    scrollToBottom();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: history })
      });

      // Remove typing indicator
      const indicator = document.getElementById('chatbotTypingIndicator');
      if (indicator) indicator.remove();

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const serverError = errorData.error || `HTTP Error ${res.status}`;
        appendMessage('bot', `Error: ${serverError}`);
        return;
      }

      const data = await res.json();
      const botReply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
        ? data.choices[0].message.content
        : 'Sorry, I couldn\'t process that request.';

      appendMessage('bot', botReply);
      history.push({ role: 'assistant', content: botReply });
    } catch (err) {
      console.error('[Chatbot UI Error]:', err);
      const indicator = document.getElementById('chatbotTypingIndicator');
      if (indicator) indicator.remove();
      appendMessage('bot', 'Error: Unable to connect to the assistant server.');
    }
  }

  // Event Listeners
  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
})();

// ═══════════════════════════════════════════════
// LOGISTICS / INVENTORY
// ═══════════════════════════════════════════════

async function safeFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let errMsg = `Request failed with status ${res.status}`;
    if (contentType.includes('application/json')) {
      const errData = await res.json();
      errMsg = errData.error || errMsg;
    } else {
      const text = await res.text();
      if (text.startsWith('<')) {
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        const preMatch = text.match(/<pre>(.*?)<\/pre>/i);
        if (preMatch && preMatch[1]) {
          errMsg = preMatch[1];
        } else if (titleMatch && titleMatch[1]) {
          errMsg = titleMatch[1];
        }
      } else if (text.length < 100) {
        errMsg = text;
      }
    }
    throw new Error(errMsg);
  }
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response');
  }
  return await res.json();
}

let logisticsSearchTimeout;
document.getElementById('logisticsSearchInput').addEventListener('input', () => {
  clearTimeout(logisticsSearchTimeout);
  logisticsSearchTimeout = setTimeout(() => loadLogistics(), 300);
});

// Setup drag and drop for image upload
const dropzone = document.getElementById('logisticsDropzone');
const fileInput = document.getElementById('logisticsImageInput');
const imgPreview = document.getElementById('logisticsImagePreview');
const dropzoneText = dropzone.querySelector('.dropzone-text');

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('active');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('active');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('active');
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    handleImagePreview(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    handleImagePreview(e.target.files[0]);
  }
});

function handleImagePreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    imgPreview.src = e.target.result;
    imgPreview.style.display = 'block';
    dropzoneText.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearLogisticsImagePreview() {
  fileInput.value = '';
  imgPreview.src = '';
  imgPreview.style.display = 'none';
  dropzoneText.style.display = 'block';
}

// Add Item Modal
const logisticsModal = document.getElementById('logisticsModal');
document.getElementById('addLogisticsBtn').addEventListener('click', () => {
  document.getElementById('logisticsModalTitle').textContent = 'Add New Product';
  document.getElementById('logisticsModalSubmit').textContent = 'Add Product';
  document.getElementById('logisticsForm').reset();
  document.getElementById('logisticsId').value = '';
  document.getElementById('logisticsQuantityGroup').style.display = 'block';
  document.getElementById('logisticsQuantity').required = true;
  clearLogisticsImagePreview();
  logisticsModal.classList.add('active');
});

// Modal close buttons
document.getElementById('logisticsModalClose').addEventListener('click', () => logisticsModal.classList.remove('active'));
document.getElementById('logisticsModalCancel').addEventListener('click', () => logisticsModal.classList.remove('active'));
logisticsModal.addEventListener('click', (e) => { if (e.target === logisticsModal) logisticsModal.classList.remove('active'); });

// Submit Add/Edit Product
document.getElementById('logisticsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('logisticsId').value;
  const name = document.getElementById('logisticsName').value.trim();
  const price = document.getElementById('logisticsPrice').value;
  
  const payload = {
    name,
    price: parseFloat(price)
  };

  if (!id) {
    const quantity = document.getElementById('logisticsQuantity').value;
    payload.quantity = parseInt(quantity) || 0;
  }

  if (fileInput.files.length) {
    const file = fileInput.files[0];
    const base64 = await toBase64(file);
    payload.image_base64 = base64;
  }

  try {
    const url = id ? `/api/logistics/${id}` : '/api/logistics';
    const method = id ? 'PUT' : 'POST';
    
    await safeFetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast(id ? 'Product updated successfully' : 'Product added successfully', 'success');
    logisticsModal.classList.remove('active');
    loadLogistics();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Load Logistics Page
async function loadLogistics() {
  const search = document.getElementById('logisticsSearchInput').value;
  try {
    const products = await safeFetchJson(`/api/logistics?search=${encodeURIComponent(search)}`);
    renderLogistics(products);

    const transactions = await safeFetchJson('/api/logistics/transactions?limit=15');
    renderLogisticsTransactions(transactions);
  } catch (err) {
    showToast('Failed to load logistics: ' + err.message, 'error');
  }
}

// Render Products
function renderLogistics(products) {
  const grid = document.getElementById('logisticsGrid');
  const empty = document.getElementById('emptyLogistics');
  
  if (products.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  
  grid.innerHTML = products.map(p => {
    let stockClass = 'stock-in';
    let stockLabel = 'In Stock';
    
    if (p.quantity === 0) {
      stockClass = 'stock-out';
      stockLabel = 'Out of Stock';
    } else if (p.quantity <= 5) {
      stockClass = 'stock-low';
      stockLabel = `Low Stock (${p.quantity})`;
    } else {
      stockLabel = `In Stock (${p.quantity})`;
    }

    const imgTag = p.image_path 
      ? `<img src="${p.image_path}" class="logistics-card-img" alt="${escapeHtml(p.name)}">`
      : `<div class="logistics-card-img-placeholder">📦</div>`;

    return `
      <div class="logistics-card">
        <button class="logistics-card-edit-btn" onclick="editLogistics(${p.id})" title="Edit details">✏️</button>
        <div class="logistics-card-img-wrapper">
          ${imgTag}
        </div>
        <div class="logistics-card-info">
          <div class="logistics-card-name">${escapeHtml(p.name)}</div>
          <div class="logistics-card-price">Rs. ${parseFloat(p.price).toFixed(2)}</div>
          <div class="logistics-card-stock-row">
            <span class="badge ${stockClass}">${stockLabel}</span>
          </div>
        </div>
        <div class="logistics-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="showRestockModal(${p.id}, '${escapeHtml(p.name)}', ${p.quantity})">➕ Restock</button>
          <button class="btn btn-primary btn-sm" onclick="showSellModal(${p.id}, '${escapeHtml(p.name)}', ${p.quantity})" ${p.quantity === 0 ? 'disabled' : ''}>💸 Sell</button>
        </div>
        <button class="action-btn delete" onclick="deleteLogistics(${p.id}, '${escapeHtml(p.name)}')" title="Delete product" style="position:absolute; bottom:52px; right:12px; width:28px; height:28px; font-size:12px; padding:0; display:flex; align-items:center; justify-content:center;">🗑️</button>
      </div>
    `;
  }).join('');
}

// Render Transactions Timeline
function renderLogisticsTransactions(transactions) {
  const container = document.getElementById('logisticsTransactionList');
  if (transactions.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">No transactions recorded yet.</div>`;
    return;
  }

  container.innerHTML = transactions.map(t => {
    const isRestock = t.type === 'restock';
    const classType = isRestock ? 'restock' : 'sale';
    const icon = isRestock ? '📥' : '📤';
    const actionLabel = isRestock ? 'Restocked' : 'Sold';
    const qtySign = isRestock ? '+' : '-';
    
    return `
      <div class="transaction-item ${classType}">
        <div class="transaction-icon">${icon}</div>
        <div class="transaction-info">
          <div class="title">${actionLabel} ${t.quantity} ${escapeHtml(t.product_name)}</div>
          <div class="meta">
            ${qtySign}${t.quantity} items | Rs. ${(t.price * t.quantity).toFixed(0)} | ${formatDate(t.date)}
          </div>
          ${t.notes ? `<div class="notes">"${escapeHtml(t.notes)}"</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Edit Product Mode
async function editLogistics(id) {
  try {
    const products = await safeFetchJson(`/api/logistics`);
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('logisticsModalTitle').textContent = 'Edit Product';
    document.getElementById('logisticsModalSubmit').textContent = 'Save Changes';
    document.getElementById('logisticsId').value = product.id;
    document.getElementById('logisticsName').value = product.name;
    document.getElementById('logisticsPrice').value = product.price;
    document.getElementById('logisticsQuantityGroup').style.display = 'none';
    document.getElementById('logisticsQuantity').required = false;

    if (product.image_path) {
      imgPreview.src = product.image_path;
      imgPreview.style.display = 'block';
      dropzoneText.style.display = 'none';
    } else {
      clearLogisticsImagePreview();
    }

    logisticsModal.classList.add('active');
  } catch (err) {
    showToast('Failed to fetch product details: ' + err.message, 'error');
  }
}

// Sell Modal Operations
const sellModal = document.getElementById('logisticsSellModal');
function showSellModal(id, name, stock) {
  document.getElementById('logisticsSellId').value = id;
  document.getElementById('logisticsSellProductName').textContent = name;
  document.getElementById('logisticsSellProductStock').textContent = `Available stock: ${stock}`;
  document.getElementById('logisticsSellQuantity').value = '';
  document.getElementById('logisticsSellQuantity').max = stock;
  document.getElementById('logisticsSellNotes').value = '';
  sellModal.classList.add('active');
}

document.getElementById('logisticsSellModalClose').addEventListener('click', () => sellModal.classList.remove('active'));
document.getElementById('logisticsSellModalCancel').addEventListener('click', () => sellModal.classList.remove('active'));
sellModal.addEventListener('click', (e) => { if (e.target === sellModal) sellModal.classList.remove('active'); });

document.getElementById('logisticsSellForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('logisticsSellId').value;
  const quantity = parseInt(document.getElementById('logisticsSellQuantity').value);
  const notes = document.getElementById('logisticsSellNotes').value.trim();

  try {
    await safeFetchJson(`/api/logistics/${id}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity, notes })
    });

    showToast('Sale recorded successfully', 'success');
    sellModal.classList.remove('active');
    loadLogistics();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Restock Modal Operations
const restockModal = document.getElementById('logisticsRestockModal');
function showRestockModal(id, name, stock) {
  document.getElementById('logisticsRestockId').value = id;
  document.getElementById('logisticsRestockProductName').textContent = name;
  document.getElementById('logisticsRestockProductStock').textContent = `Current stock: ${stock}`;
  document.getElementById('logisticsRestockQuantity').value = '';
  document.getElementById('logisticsRestockNotes').value = '';
  restockModal.classList.add('active');
}

document.getElementById('logisticsRestockModalClose').addEventListener('click', () => restockModal.classList.remove('active'));
document.getElementById('logisticsRestockModalCancel').addEventListener('click', () => restockModal.classList.remove('active'));
restockModal.addEventListener('click', (e) => { if (e.target === restockModal) restockModal.classList.remove('active'); });

document.getElementById('logisticsRestockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('logisticsRestockId').value;
  const quantity = parseInt(document.getElementById('logisticsRestockQuantity').value);
  const notes = document.getElementById('logisticsRestockNotes').value.trim();

  try {
    await safeFetchJson(`/api/logistics/${id}/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity, notes })
    });

    showToast('Stock replenished successfully', 'success');
    restockModal.classList.remove('active');
    loadLogistics();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Delete Action Bridge
function confirmAction(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmDlg.classList.add('active');
  confirmCallback = callback;
}

function deleteLogistics(id, name) {
  confirmAction(
    `Delete ${name}?`,
    `Are you sure you want to remove this product and delete its transaction history?`,
    async () => {
      try {
        await safeFetchJson(`/api/logistics/${id}`, { method: 'DELETE' });
        showToast('Product deleted successfully', 'success');
        loadLogistics();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// ─── MEMBER WEBCAM & PHOTO HANDLERS ───
let memberPhotoBase64 = null;
let memberPhotoCleared = false;
let webcamStreamTrack = null;

const memberImageInput = document.getElementById('memberImageInput');
const memberPhotoPreview = document.getElementById('memberPhotoPreview');
const memberPhotoInitials = document.getElementById('memberPhotoInitials');
const memberPhotoClearBtn = document.getElementById('memberPhotoClearBtn');

memberImageInput.addEventListener('change', async (e) => {
  if (e.target.files.length) {
    const file = e.target.files[0];
    const base64 = await toBase64(file);
    memberPhotoBase64 = base64;
    memberPhotoCleared = false;
    
    memberPhotoPreview.src = base64;
    memberPhotoPreview.style.display = 'block';
    memberPhotoInitials.style.display = 'none';
    memberPhotoClearBtn.style.display = 'flex';
  }
});

memberPhotoClearBtn.addEventListener('click', () => {
  clearMemberPhoto();
  memberPhotoCleared = true;
});

function clearMemberPhoto() {
  memberPhotoBase64 = null;
  memberPhotoCleared = false;
  memberImageInput.value = '';
  memberPhotoPreview.src = '';
  memberPhotoPreview.style.display = 'none';
  memberPhotoInitials.style.display = 'flex';
  memberPhotoInitials.textContent = '?';
  memberPhotoClearBtn.style.display = 'none';
  
  document.getElementById('photoTabUploadBtn').click();
  stopWebcam();
}

function setMemberPhotoPreview(avatarPath, fullName) {
  clearMemberPhoto();
  if (avatarPath) {
    memberPhotoPreview.src = avatarPath;
    memberPhotoPreview.style.display = 'block';
    memberPhotoInitials.style.display = 'none';
    memberPhotoClearBtn.style.display = 'flex';
  } else {
    memberPhotoPreview.style.display = 'none';
    memberPhotoInitials.style.display = 'flex';
    memberPhotoInitials.textContent = getInitials(fullName);
  }
}

async function startWebcam() {
  const video = document.getElementById('webcamStream');
  const startBtn = document.getElementById('webcamStartBtn');
  const captureBtn = document.getElementById('webcamCaptureBtn');
  const viewfinder = document.getElementById('webcamViewfinder');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    video.srcObject = stream;
    webcamStreamTrack = stream;
    startBtn.style.display = 'none';
    captureBtn.style.display = 'inline-flex';
    if (viewfinder) viewfinder.style.display = 'block';
  } catch (err) {
    showToast('Could not access webcam: ' + err.message, 'error');
  }
}

function stopWebcam() {
  if (webcamStreamTrack) {
    webcamStreamTrack.getTracks().forEach(track => track.stop());
    webcamStreamTrack = null;
  }
  const video = document.getElementById('webcamStream');
  if (video) video.srcObject = null;
  
  const startBtn = document.getElementById('webcamStartBtn');
  const captureBtn = document.getElementById('webcamCaptureBtn');
  const viewfinder = document.getElementById('webcamViewfinder');
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (captureBtn) captureBtn.style.display = 'none';
  if (viewfinder) viewfinder.style.display = 'none';
}

function captureWebcamPhoto() {
  const video = document.getElementById('webcamStream');
  const canvas = document.getElementById('webcamCanvas');
  if (!webcamStreamTrack) return;
  
  const ctx = canvas.getContext('2d');
  
  // Mirror-flip the drawn frame so it matches the mirrored preview view
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  
  const dataUrl = canvas.toDataURL('image/png');
  
  memberPhotoBase64 = dataUrl;
  memberPhotoCleared = false;
  
  memberPhotoPreview.src = dataUrl;
  memberPhotoPreview.style.display = 'block';
  memberPhotoInitials.style.display = 'none';
  memberPhotoClearBtn.style.display = 'flex';
  
  showToast('Photo captured!', 'success');
}

document.getElementById('photoTabUploadBtn').addEventListener('click', () => {
  document.getElementById('photoTabUploadBtn').classList.add('active');
  document.getElementById('photoTabWebcamBtn').classList.remove('active');
  document.getElementById('photoPaneUpload').classList.add('active');
  document.getElementById('photoPaneWebcam').classList.remove('active');
  stopWebcam();
});

document.getElementById('photoTabWebcamBtn').addEventListener('click', () => {
  document.getElementById('photoTabWebcamBtn').classList.add('active');
  document.getElementById('photoTabUploadBtn').classList.remove('active');
  document.getElementById('photoPaneWebcam').classList.add('active');
  document.getElementById('photoPaneUpload').classList.remove('active');
});

document.getElementById('webcamStartBtn').addEventListener('click', startWebcam);
document.getElementById('webcamCaptureBtn').addEventListener('click', captureWebcamPhoto);

// ─── OFFER PACKAGES MANAGEMENT ───
let customPackages = [];

async function loadPackages() {
  try {
    const res = await fetch('/api/packages');
    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned HTML instead of JSON. Please restart the backend server.');
    }
    customPackages = await res.json();
    
    // Render settings custom packages list table
    const tbody = document.getElementById('packagesListBody');
    const empty = document.getElementById('emptyPackagesState');
    
    if (!tbody || !empty) return;
    
    if (customPackages.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      tbody.innerHTML = customPackages.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>${p.duration_months} Month${p.duration_months > 1 ? 's' : ''}</td>
          <td>Rs. ${p.price}</td>
          <td style="text-align: center;">
            <button class="action-btn delete" onclick="deletePackage(${p.id}, '${escapeHtml(p.name)}')" title="Delete Package">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </td>
        </tr>
      `).join('');
    }
    
    updateMemberPlanDropdown();
  } catch (err) {
    console.error('Failed to load packages:', err);
  }
}

function updateMemberPlanDropdown() {
  const select = document.getElementById('memberPlan');
  if (!select) return;
  
  // Retain standard options
  let html = `
    <option value="Monthly">Monthly</option>
    <option value="Quarterly">Quarterly (3 months)</option>
    <option value="Half-Yearly">Half-Yearly (6 months)</option>
    <option value="Yearly">Yearly (12 months)</option>
  `;
  
  // Append custom packages
  customPackages.forEach(p => {
    html += `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${p.duration_months} Months - Rs. ${p.price})</option>`;
  });
  
  select.innerHTML = html;
}

document.getElementById('createPackageForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('pkgName').value.trim();
  const duration_months = parseInt(document.getElementById('pkgDuration').value);
  const price = parseFloat(document.getElementById('pkgPrice').value);
  
  try {
    const res = await fetch('/api/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, duration_months, price })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create package');
    
    showToast('Package created successfully!', 'success');
    e.target.reset();
    loadPackages();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function deletePackage(id, name) {
  confirmAction(
    `Delete ${name}?`,
    `Are you sure you want to remove this custom membership package?`,
    async () => {
      try {
        const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        showToast('Package deleted successfully', 'success');
        loadPackages();
      } catch (err) {
        showToast(err.message || 'Failed to delete package', 'error');
      }
    }
  );
}

// ═══════════════════════════════════════════════
// MEMBER PROFILE & ADVANCED FINANCIAL SYSTEM
// ═══════════════════════════════════════════════

// confirmAction Utility
function confirmAction(title, message, callback) {
  confirmCallback = callback;
  deleteId = null;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmDialog').classList.add('active');
}

// Back button listener
document.getElementById('btnBackToMembers')?.addEventListener('click', () => {
  navigateTo('members');
});

// View Member Profile page loader
async function viewMemberProfile(memberId) {
  try {
    const res = await fetch(`/api/members/${memberId}/profile`);
    if (!res.ok) throw new Error('Profile not found');
    const data = await res.json();
    
    const { member, currentMembership, stats, timeline } = data;
    
    // Set Profile Header
    document.getElementById('profileFullName').textContent = member.full_name;
    document.getElementById('profileMemberCode').textContent = member.member_code || `FH-${member.id.toString().padStart(6, '0')}`;
    document.getElementById('profilePhone').textContent = member.phone;
    
    // Avatar
    const avatarArea = document.getElementById('profileAvatarArea');
    if (member.avatar_path) {
      avatarArea.innerHTML = `<img src="${member.avatar_path}" class="profile-avatar-img" alt="${escapeHtml(member.full_name)}">`;
    } else {
      avatarArea.innerHTML = `<div class="profile-avatar-initials">${getInitials(member.full_name)}</div>`;
    }
    
    // Membership Status Badge
    const mBadge = document.getElementById('profileMembershipBadge');
    mBadge.className = 'badge';
    let statusClass = 'expired';
    let statusLabel = 'EXPIRED';
    if (currentMembership) {
      statusClass = currentMembership.membership_status.toLowerCase();
      statusLabel = currentMembership.membership_status;
    }
    mBadge.classList.add(statusClass);
    mBadge.textContent = statusLabel;
    
    // Payment Status Badge
    const pBadge = document.getElementById('profilePaymentBadge');
    pBadge.style.display = 'inline-flex';
    pBadge.className = 'badge';
    if (stats.totalOutstandingBalance === 0) {
      pBadge.style.background = 'rgba(16, 185, 129, 0.12)';
      pBadge.style.color = '#059669';
      pBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      pBadge.textContent = 'PAID';
    } else {
      if (currentMembership && currentMembership.payment_status === 'OVERDUE') {
        pBadge.style.background = 'rgba(239, 68, 68, 0.12)';
        pBadge.style.color = '#dc2626';
        pBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        pBadge.textContent = `OVERDUE: NPR ${stats.totalOutstandingBalance.toLocaleString()}`;
      } else if (stats.totalAmountPaid > 0) {
        pBadge.style.background = 'rgba(245, 158, 11, 0.12)';
        pBadge.style.color = '#d97706';
        pBadge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
        pBadge.textContent = `DUE: NPR ${stats.totalOutstandingBalance.toLocaleString()}`;
      } else {
        pBadge.style.background = 'rgba(100, 116, 139, 0.12)';
        pBadge.style.color = '#475569';
        pBadge.style.border = '1px solid rgba(100, 116, 139, 0.3)';
        pBadge.textContent = `UNPAID: NPR ${stats.totalOutstandingBalance.toLocaleString()}`;
      }
    }
    
    // Metric Boxes
    document.getElementById('profileStatOutstanding').textContent = `NPR ${stats.totalOutstandingBalance.toLocaleString()}`;
    document.getElementById('profileStatPaid').textContent = `NPR ${stats.totalAmountPaid.toLocaleString()}`;
    document.getElementById('profileStatExpiry').textContent = currentMembership ? formatDate(currentMembership.end_date) : 'N/A';
    document.getElementById('profileStatRenewals').textContent = `${stats.totalRenewals} Renewal${stats.totalRenewals !== 1 ? 's' : ''}`;
    
    // Personal Details Tab data
    document.getElementById('detailJoinDate').textContent = formatDate(member.first_joining_date || member.join_date);
    document.getElementById('detailDOB').textContent = member.date_of_birth ? formatDate(member.date_of_birth) : 'N/A';
    document.getElementById('detailGender').textContent = member.gender || 'N/A';
    document.getElementById('detailEmail').textContent = member.email || 'N/A';
    document.getElementById('detailAddress').textContent = member.address || 'N/A';
    document.getElementById('detailEmergencyContact').textContent = member.emergency_contact_name || 'N/A';
    document.getElementById('detailEmergencyPhone').textContent = member.emergency_contact_phone || 'N/A';
    
    // Bind action buttons click listeners
    // Record Pay dues quick fill
    const payBtn = document.getElementById('btnRecordPayment');
    if (currentMembership && stats.totalOutstandingBalance > 0) {
      payBtn.style.display = 'inline-block';
      payBtn.onclick = () => openRecordPaymentModal(member.id, currentMembership.id, currentMembership.plan_name_snapshot, stats.totalOutstandingBalance);
    } else {
      payBtn.style.display = 'none';
    }
    
    // Renew Membership
    document.getElementById('btnRenewMembership').onclick = () => openRenewMembershipModal(member.id, currentMembership);
    
    // Freeze Membership
    const freezeBtn = document.getElementById('btnFreezeMembership');
    if (currentMembership && currentMembership.membership_status === 'ACTIVE') {
      freezeBtn.style.display = 'inline-block';
      freezeBtn.onclick = () => openFreezeMembershipModal(currentMembership.id);
    } else {
      freezeBtn.style.display = 'none';
    }
    
    // Edit Member Profile
    document.getElementById('btnEditMemberProfile').onclick = () => editMember(member.id);
    
    // Set up tabs switching
    const tabs = document.querySelectorAll('.profile-tab');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadProfileTabContent(tab.dataset.tab, member.id, timeline);
      };
    });
    
    // Active Overview Tab initially
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.profile-tab[data-tab="overview"]').classList.add('active');
    loadProfileTabContent('overview', member.id, timeline);
    
    // Switch Page View to Member Profile
    navigateToProfileView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function navigateToProfileView() {
  navItems.forEach(n => n.classList.remove('active'));
  pages.forEach(p => p.classList.remove('active'));
  document.getElementById('nav-members').classList.add('active');
  document.getElementById('page-member-profile').classList.add('active');
}

// Render tab contents dynamically
function loadProfileTabContent(tabName, memberId, timeline = []) {
  const panes = document.querySelectorAll('.profile-tab-content');
  panes.forEach(p => p.classList.remove('active'));
  document.getElementById(`pane-${tabName}`).classList.add('active');
  
  if (tabName === 'overview') {
    const timelineContainer = document.getElementById('profileActivityTimeline');
    if (timeline.length === 0) {
      timelineContainer.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding-left:10px;">No recorded activity logs.</div>';
      return;
    }
    
    timelineContainer.innerHTML = timeline.map(log => `
      <div class="timeline-item ${log.type}">
        <div class="timeline-item-dot"></div>
        <div class="timeline-item-content">
          <div class="timeline-item-date">${formatDateTime(log.date)}</div>
          <div class="timeline-item-text">${escapeHtml(log.message)}</div>
        </div>
      </div>
    `).join('');
  } 
  else if (tabName === 'memberships') {
    loadProfileMemberships(memberId);
  } 
  else if (tabName === 'payments') {
    loadProfilePayments(memberId);
  } 
  else if (tabName === 'attendance') {
    loadProfileAttendance(memberId);
  }
}

async function loadProfileMemberships(memberId) {
  const tbody = document.getElementById('profileMembershipsBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading memberships...</td></tr>';
  try {
    const res = await fetch(`/api/members/${memberId}/memberships`);
    const history = await res.json();
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No membership records found.</td></tr>';
      return;
    }
    tbody.innerHTML = history.map(ms => {
      let discText = '-';
      if (ms.discount_type === 'FIXED') discText = `Rs. ${ms.discount_amount}`;
      else if (ms.discount_type === 'PERCENT') discText = `${ms.discount_amount}%`;
      
      return `
        <tr>
          <td><strong>${escapeHtml(ms.plan_name_snapshot)}</strong></td>
          <td>${formatDate(ms.start_date)}</td>
          <td>${formatDate(ms.end_date)}</td>
          <td>Rs. ${ms.original_price}</td>
          <td>${discText}</td>
          <td>Rs. ${ms.final_payable_amount}</td>
          <td>Rs. ${ms.total_paid}</td>
          <td><span class="badge ${ms.membership_status.toLowerCase()}">${ms.membership_status}</span></td>
        </tr>
      `;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--red);">Failed to load memberships.</td></tr>';
  }
}

async function loadProfilePayments(memberId) {
  const tbody = document.getElementById('profilePaymentsBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading payments...</td></tr>';
  try {
    const res = await fetch(`/api/members/${memberId}/payments`);
    const payments = await res.json();
    if (payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No payment transactions recorded.</td></tr>';
      return;
    }
    tbody.innerHTML = payments.map(p => {
      const isReversable = p.payment_status === 'COMPLETED';
      const statusLabel = p.payment_status;
      const statusStyle = p.payment_status === 'REVERSED' ? 'background:#ef4444; color:white;' : 'background:var(--green); color:white;';
      
      let refText = p.transaction_reference || '-';
      if (p.adjustment_type === 'REVERSAL') {
        refText += ` <span style="font-size:10px; color:#ef4444;">(Reversed: ${escapeHtml(p.adjustment_reason)})</span>`;
      }
      
      const reverseBtn = isReversable 
        ? `<button class="btn btn-outline btn-sm" onclick="reversePaymentAction(${p.id}, ${p.amount}, '${p.receipt_number}')" style="padding:4px 8px; font-size:11px; border-color:#ef4444; color:#ef4444;">Reverse</button>`
        : `<span style="font-size:12px; color:var(--text-muted);">Locked</span>`;
        
      return `
        <tr>
          <td>${formatDateTime(p.payment_date)}</td>
          <td><code>${p.receipt_number}</code></td>
          <td><strong>Rs. ${p.amount}</strong></td>
          <td>${p.payment_method}</td>
          <td>${refText}</td>
          <td>${escapeHtml(p.recorded_by)}</td>
          <td><span class="badge" style="${statusStyle}">${statusLabel}</span></td>
          <td>${reverseBtn}</td>
        </tr>
      `;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--red);">Failed to load payment transactions.</td></tr>';
  }
}

async function loadProfileAttendance(memberId) {
  const tbody = document.getElementById('profileAttendanceBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading attendance logs...</td></tr>';
  try {
    const res = await fetch(`/api/attendance?limit=200`);
    if (!res.ok) throw new Error();
    const allLogs = await res.json();
    const memberLogs = allLogs.filter(log => log.member_id === memberId);
    
    if (memberLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No gym visits recorded.</td></tr>';
      return;
    }
    
    tbody.innerHTML = memberLogs.map(log => `
      <tr>
        <td>${formatDate(log.date)}</td>
        <td>${log.check_in_time}</td>
        <td><span class="badge ${log.shift === 'morning' ? 'warning' : 'active'}" style="text-transform:capitalize;">${log.shift}</span></td>
        <td>${escapeHtml(log.device_ip || 'Manual Check-in')}</td>
      </tr>
    `).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--red);">Failed to load attendance logs.</td></tr>';
  }
}

// Reverse Payment Action Confirmation Trigger
function reversePaymentAction(paymentId, amount, receiptNumber) {
  const reason = prompt(`⚠️ REVERSE PAYMENT TRANSACTION\nAre you sure you want to reverse the payment of NPR ${amount} (Receipt: ${receiptNumber})?\nThis will restore the outstanding dues balance.\n\nPlease enter the reason for reversal below:`);
  
  if (reason === null) return;
  if (reason.trim() === '') {
    showToast('Reversal reason is required.', 'error');
    return;
  }
  
  confirmAction(
    'Confirm Reversal?',
    `Are you sure you want to reverse this payment of NPR ${amount}? This action will write a reversal audit block.`,
    async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}/reverse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        showToast('Payment transaction reversed successfully.', 'success');
        const activeMemberId = document.getElementById('renewMemberId').value;
        if (activeMemberId) {
          viewMemberProfile(activeMemberId);
        } else {
          loadMembers();
        }
      } catch (err) {
        showToast(err.message || 'Failed to reverse payment', 'error');
      }
    }
  );
}

// ─── Renew Membership Modal Behavior ───
const renewModal = document.getElementById('renewMembershipModal');
const renewForm = document.getElementById('renewMembershipForm');

async function openRenewMembershipModal(memberId, currentMembership) {
  document.getElementById('renewMemberId').value = memberId;
  renewForm.reset();
  
  let startDate = new Date();
  if (currentMembership && new Date(currentMembership.end_date) >= new Date()) {
    const end = new Date(currentMembership.end_date);
    end.setDate(end.getDate() + 1);
    startDate = end;
  }
  
  document.getElementById('renewStartDate').value = startDate.toISOString().split('T')[0];
  
  try {
    const res = await fetch('/api/plans');
    const plans = await res.json();
    const select = document.getElementById('renewPlanSelect');
    
    let html = '<option value="">-- Choose Plan --</option>';
    plans.forEach(p => {
      html += `<option value="${p.id}" data-price="${p.regular_price}" data-val="${p.duration_value}" data-type="${p.duration_type}">${escapeHtml(p.plan_name)} (NPR ${p.regular_price})</option>`;
    });
    select.innerHTML = html;
    
    select.onchange = () => {
      const opt = select.options[select.selectedIndex];
      if (!opt.value) {
        document.getElementById('renewOriginalPrice').value = '';
        document.getElementById('renewFinalPayable').value = '';
        return;
      }
      
      const price = parseFloat(opt.dataset.price);
      document.getElementById('renewOriginalPrice').value = price;
      
      const durationVal = parseInt(opt.dataset.val);
      const durationType = opt.dataset.type;
      
      const start = new Date(document.getElementById('renewStartDate').value);
      if (durationType === 'MONTH') {
        start.setMonth(start.getMonth() + durationVal);
      } else if (durationType === 'DAY') {
        start.setDate(start.getDate() + durationVal);
      } else if (durationType === 'WEEK') {
        start.setDate(start.getDate() + (durationVal * 7));
      } else if (durationType === 'YEAR') {
        start.setFullYear(start.getFullYear() + durationVal);
      }
      
      document.getElementById('renewEndDate').value = start.toISOString().split('T')[0];
      calculateRenewFinalPayable();
    };
    
    document.getElementById('renewDiscountType').onchange = calculateRenewFinalPayable;
    document.getElementById('renewDiscountAmount').oninput = calculateRenewFinalPayable;
    
    renewModal.classList.add('active');
  } catch {
    showToast('Failed to load plans list.', 'error');
  }
}

function calculateRenewFinalPayable() {
  const originalPrice = parseFloat(document.getElementById('renewOriginalPrice').value) || 0;
  const discType = document.getElementById('renewDiscountType').value;
  const discAmount = parseFloat(document.getElementById('renewDiscountAmount').value) || 0;
  
  let payable = originalPrice;
  if (discType === 'FIXED') {
    payable = Math.max(0, originalPrice - discAmount);
  } else if (discType === 'PERCENT') {
    payable = Math.max(0, originalPrice - (originalPrice * (discAmount / 100)));
  }
  
  document.getElementById('renewFinalPayable').value = Math.round(payable);
  document.getElementById('renewAmountPaid').value = Math.round(payable);
}

function closeRenewModal() {
  renewModal.classList.remove('active');
}
document.getElementById('renewModalClose')?.addEventListener('click', closeRenewModal);
document.getElementById('renewModalCancel')?.addEventListener('click', closeRenewModal);

renewForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const memberId = document.getElementById('renewMemberId').value;
  const planId = document.getElementById('renewPlanSelect').value;
  
  const payload = {
    plan_id: planId ? parseInt(planId) : null,
    start_date: document.getElementById('renewStartDate').value,
    end_date: document.getElementById('renewEndDate').value,
    original_price: parseFloat(document.getElementById('renewOriginalPrice').value) || 0,
    discount_type: document.getElementById('renewDiscountType').value,
    discount_amount: parseFloat(document.getElementById('renewDiscountAmount').value) || 0,
    final_payable_amount: parseFloat(document.getElementById('renewFinalPayable').value) || 0,
    payment_due_date: document.getElementById('renewPaymentDueDate').value || null,
    notes: document.getElementById('renewNotes').value.trim(),
    amount_paid: parseFloat(document.getElementById('renewAmountPaid').value) || 0,
    payment_method: document.getElementById('renewPaymentMethod').value,
    transaction_reference: document.getElementById('renewPaymentRef').value.trim(),
    payment_notes: 'Initial renewal deposit'
  };
  
  try {
    const res = await fetch(`/api/members/${memberId}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    showToast('Membership renewed successfully!', 'success');
    closeRenewModal();
    viewMemberProfile(memberId);
  } catch (err) {
    showToast(err.message || 'Failed to renew membership', 'error');
  }
});


// ─── Record Dues Payment Modal ───
const payModal = document.getElementById('recordPaymentModal');
const payForm = document.getElementById('recordPaymentForm');

function openRecordPaymentModal(memberId, membershipId, planName, outstandingDues) {
  document.getElementById('recordPayMemberId').value = memberId;
  document.getElementById('recordPayMembershipId').value = membershipId;
  document.getElementById('recordPayPlanName').textContent = planName;
  document.getElementById('recordPayOutstandingBalance').textContent = `NPR ${outstandingDues.toLocaleString()}`;
  document.getElementById('recordPayAmount').value = outstandingDues;
  document.getElementById('recordPayAmount').max = outstandingDues;
  
  payModal.classList.add('active');
}

function closePayModal() {
  payModal.classList.remove('active');
}
document.getElementById('recordPaymentModalClose')?.addEventListener('click', closePayModal);
document.getElementById('recordPayModalCancel')?.addEventListener('click', closePayModal);

payForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const memberId = document.getElementById('recordPayMemberId').value;
  const membershipId = document.getElementById('recordPayMembershipId').value;
  
  const payload = {
    member_id: parseInt(memberId),
    membership_id: parseInt(membershipId),
    amount: parseFloat(document.getElementById('recordPayAmount').value),
    payment_method: document.getElementById('recordPayMethod').value,
    transaction_reference: document.getElementById('recordPayRef').value.trim(),
    notes: document.getElementById('recordPayNotes').value.trim()
  };
  
  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    showToast('Payment recorded successfully!', 'success');
    closePayModal();
    const activePage = document.querySelector('.page-section.active')?.id;
    if (activePage === 'page-member-profile') {
      viewMemberProfile(memberId);
    } else {
      loadDuesPage();
    }
  } catch (err) {
    showToast(err.message || 'Failed to save payment', 'error');
  }
});


// ─── Freeze Membership Modal ───
const freezeModal = document.getElementById('freezeMembershipModal');
const freezeForm = document.getElementById('freezeMembershipForm');

function openFreezeMembershipModal(membershipId) {
  document.getElementById('freezeMembershipId').value = membershipId;
  freezeForm.reset();
  freezeModal.classList.add('active');
}

function closeFreezeModal() {
  freezeModal.classList.remove('active');
}
document.getElementById('freezeModalClose')?.addEventListener('click', closeFreezeModal);
document.getElementById('freezeModalCancel')?.addEventListener('click', closeFreezeModal);

freezeForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const membershipId = document.getElementById('freezeMembershipId').value;
  const days = parseInt(document.getElementById('freezeDays').value);
  const reason = document.getElementById('freezeReason').value.trim();
  
  try {
    const res = await fetch(`/api/memberships/${membershipId}/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    showToast('Membership frozen successfully!', 'success');
    closeFreezeModal();
    const activeMemberId = document.getElementById('renewMemberId').value;
    if (activeMemberId) {
      viewMemberProfile(activeMemberId);
    }
  } catch (err) {
    showToast(err.message || 'Failed to freeze membership', 'error');
  }
});


// ─── Outstanding Dues Dashboard Page ───
async function loadDuesPage() {
  try {
    const res = await fetch('/api/payments/dues');
    const data = await res.json();
    
    const { stats, dues } = data;
    
    document.getElementById('duesStatTotal').textContent = `NPR ${stats.totalOutstandingAmount.toLocaleString()}`;
    document.getElementById('duesStatCollected').textContent = `NPR ${stats.amountCollectedToday.toLocaleString()}`;
    document.getElementById('duesStatCollectedMonth').textContent = `NPR ${stats.amountCollectedThisMonth.toLocaleString()}`;
    document.getElementById('duesStatCollectedYear').textContent = `NPR ${stats.amountCollectedThisYear.toLocaleString()}`;
    
    const tbody = document.getElementById('duesListBody');
    const emptyState = document.getElementById('emptyDuesList');
    
    if (dues.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    tbody.innerHTML = dues.map(d => {
      const overdueBadge = d.days_overdue > 0 
        ? `<span class="badge expired" style="background:#ef4444; color:white; font-size:10px;">${d.days_overdue} Days Overdue</span>`
        : `<span class="badge warning" style="background:#f59e0b; color:white; font-size:10px;">Pending</span>`;
        
      return `
        <tr>
          <td>
            <div class="capitalize" style="font-weight:700; color:var(--text-primary); cursor:pointer;" onclick="viewMemberProfile(${d.member_id})">${escapeHtml(d.full_name)}</div>
          </td>
          <td>${escapeHtml(d.phone)}</td>
          <td><span class="badge active">${escapeHtml(d.plan_name_snapshot)}</span></td>
          <td>${formatDate(d.end_date)}</td>
          <td>${d.payment_due_date ? formatDate(d.payment_due_date) : '-'} ${overdueBadge}</td>
          <td>Rs. ${d.final_payable_amount}</td>
          <td>Rs. ${d.total_paid}</td>
          <td><strong style="color:#ef4444;">Rs. ${d.remaining_balance}</strong></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="openRecordPaymentModal(${d.member_id}, ${d.id}, '${escapeHtml(d.plan_name_snapshot)}', ${d.remaining_balance})" style="padding:4px 10px; font-size:12px;">💸 Pay</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch {
    showToast('Failed to load outstanding dues analytics.', 'error');
  }
}

// ─── Format Utilities ───
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════
// REPORTS & ANALYTICS
// ═══════════════════════════════════════════════
// REPORTS & ANALYTICS
// ═══════════════════════════════════════════════
let currentReportData = null;

function setReportDateRange(rangeType) {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  if (!startInput || !endInput) return;

  const today = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const formatD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let startDate = new Date();
  let endDate = new Date(today);

  if (rangeType === 'this_month') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (rangeType === 'last_30') {
    startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (rangeType === 'last_90') {
    startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else if (rangeType === 'this_year') {
    startDate = new Date(today.getFullYear(), 0, 1);
  } else if (rangeType === '2_years' || rangeType === 'all_time') {
    startDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());
  }

  startInput.value = formatD(startDate);
  endInput.value = formatD(endDate);
  loadReportsPage();
}
window.setReportDateRange = setReportDateRange;

// Initialize Date inputs to this month if empty
(function initReportDates() {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  if (startInput && endInput && !startInput.value) {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const pad = (n) => n.toString().padStart(2, '0');
    startInput.value = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
    endInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }
})();

async function loadReportsPage() {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  
  if (!startInput || !endInput) return;

  if (!startInput.value || !endInput.value) {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const pad = (n) => n.toString().padStart(2, '0');
    if (!startInput.value) startInput.value = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
    if (!endInput.value) endInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }

  const sDate = startInput.value;
  const eDate = endInput.value;
  
  try {
    const res = await fetch(`/api/reports/analytics?startDate=${sDate}&endDate=${eDate}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    const data = await res.json();
    currentReportData = data;

    // Update UI Mini-Previews
    const netGrowth = data.growth.newSignups - data.growth.churned;
    const netGrowthSign = netGrowth >= 0 ? `+${netGrowth}` : `${netGrowth}`;
    const netGrowthColor = netGrowth >= 0 ? 'var(--green)' : 'var(--red)';

    const previewGrowth = document.getElementById('previewGrowth');
    if (previewGrowth) {
      previewGrowth.innerHTML = `
        <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">${data.growth.totalActive} Active Members</div>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">
          <span style="color:var(--green); font-weight:600;">+${data.growth.newSignups} New</span> &bull; 
          <span style="color:var(--red); font-weight:600;">-${data.growth.churned} Expired</span>
          (${netGrowthSign} Net)
        </div>
      `;
    }

    const previewFinancials = document.getElementById('previewFinancials');
    if (previewFinancials) {
      previewFinancials.innerHTML = `
        <div style="font-size:1.1rem; font-weight:700; color:var(--green);">NPR ${data.financials.revenue.toLocaleString()}</div>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">
          <span style="color:#ef4444; font-weight:600;">NPR ${data.financials.outstandingDues.toLocaleString()}</span> Outstanding Dues
        </div>
      `;
    }

    const previewRetention = document.getElementById('previewRetention');
    if (previewRetention) {
      previewRetention.innerHTML = `
        <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">${data.retention.totalAttendance.toLocaleString()} Total Check-ins</div>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">
          <span>🌅 Morning: <strong>${data.retention.morningShift}</strong></span> &bull; 
          <span>☀️ Day: <strong>${data.retention.dayShift}</strong></span>
        </div>
      `;
    }

    // Render Full Document Preview
    const previewContainer = document.getElementById('reportPreviewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = generateProfessionalReportHTML(data);
    }

  } catch (err) {
    console.error(err);
    showToast('Failed to load reports data', 'error');
  }
}

document.getElementById('reportStartDate')?.addEventListener('change', loadReportsPage);
document.getElementById('reportEndDate')?.addEventListener('change', loadReportsPage);

function generateProfessionalReportHTML(d) {
  let paymentMethodsRows = '';
  const totalRev = d.financials.revenue || 1;
  for (const [method, amount] of Object.entries(d.financials.paymentMethods)) {
    const pct = Math.round((amount / (d.financials.revenue || 1)) * 100);
    paymentMethodsRows += `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #475569; font-weight: 500;">${method}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #1e293b;">NPR ${amount.toLocaleString()}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #64748b; font-size: 13px;">${pct}%</td>
      </tr>
    `;
  }

  let plansHTML = '';
  let totalPlanRevenue = 0;
  let totalPlanCount = 0;
  if (d.planSales && d.planSales.length > 0) {
    for (const plan of d.planSales) {
      totalPlanRevenue += plan.revenue;
      totalPlanCount += plan.count;
    }
    for (const plan of d.planSales) {
      const sharePct = totalPlanRevenue > 0 ? Math.round((plan.revenue / totalPlanRevenue) * 100) : 0;
      plansHTML += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #1e293b;">${plan.name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #475569;">${plan.count}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #059669;">NPR ${plan.revenue.toLocaleString()}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #64748b; font-size: 13px;">${sharePct}%</td>
        </tr>
      `;
    }
  } else {
    plansHTML = `<tr><td colspan="4" style="padding: 16px; color: #94a3b8; text-align: center;">No membership packages sold in this date range.</td></tr>`;
  }

  const morningPct = d.retention.totalAttendance > 0 ? Math.round((d.retention.morningShift / d.retention.totalAttendance) * 100) : 0;
  const dayPct = d.retention.totalAttendance > 0 ? Math.round((d.retention.dayShift / d.retention.totalAttendance) * 100) : 0;
  const netGrowth = d.growth.newSignups - d.growth.churned;
  const netGrowthStr = netGrowth >= 0 ? `+${netGrowth}` : `${netGrowth}`;

  return `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #1e293b; line-height: 1.5; background: #ffffff; padding: 10px;">
      
      <!-- Executive Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 18px; margin-bottom: 24px;">
        <div>
          <div style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #6366f1; text-transform: uppercase;">Executive Intelligence Report</div>
          <h1 style="color: #0f172a; margin: 4px 0 0 0; font-size: 24px; font-weight: 800;">FITNESS HUB GYM</h1>
          <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Business Performance & Financial Operations Audit</p>
        </div>
        <div style="text-align: right;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; display: inline-block;">
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Audit Duration</div>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${d.startDate} &rarr; ${d.endDate}</div>
          </div>
        </div>
      </div>

      <!-- Executive KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #10b981; border-radius: 8px; padding: 14px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Total Revenue</div>
          <div style="font-size: 20px; font-weight: 800; color: #059669; margin-top: 4px;">NPR ${d.financials.revenue.toLocaleString()}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Collected payments</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #6366f1; border-radius: 8px; padding: 14px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Active Members</div>
          <div style="font-size: 20px; font-weight: 800; color: #4338ca; margin-top: 4px;">${d.growth.totalActive}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Net Change: <strong style="color: ${netGrowth >= 0 ? '#10b981' : '#ef4444'}">${netGrowthStr}</strong></div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #0ea5e9; border-radius: 8px; padding: 14px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Gym Check-ins</div>
          <div style="font-size: 20px; font-weight: 800; color: #0369a1; margin-top: 4px;">${d.retention.totalAttendance.toLocaleString()}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Shift utilization</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #f59e0b; border-radius: 8px; padding: 14px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">Pending Dues</div>
          <div style="font-size: 20px; font-weight: 800; color: #d97706; margin-top: 4px;">NPR ${d.financials.outstandingDues.toLocaleString()}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Uncollected balances</div>
        </div>
      </div>

      <!-- Financial & Revenue Breakdown -->
      <div style="margin-bottom: 28px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; display: flex; align-items: center; gap: 6px;">
          <span>💰</span> Financial Inflows & Payment Channels
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Payment Channel</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Amount Processed</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Share</th>
            </tr>
          </thead>
          <tbody>
            ${paymentMethodsRows}
            <tr style="background: #fafafa; font-weight: 700;">
              <td style="padding: 10px 12px; color: #0f172a;">Total Realized Revenue</td>
              <td style="padding: 10px 12px; text-align: right; color: #059669; font-size: 15px;">NPR ${d.financials.revenue.toLocaleString()}</td>
              <td style="padding: 10px 12px; text-align: right; color: #0f172a;">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Plan Performance -->
      <div style="margin-bottom: 28px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; display: flex; align-items: center; gap: 6px;">
          <span>🏆</span> Membership Plans & Sales Distribution
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Package Tier</th>
              <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Units Sold</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Invoiced</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Share</th>
            </tr>
          </thead>
          <tbody>
            ${plansHTML}
          </tbody>
        </table>
      </div>

      <!-- Member Growth & Attendance Shifts -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px;">
        <!-- Member Demographics -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #ffffff;">
          <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">👥 Member Retention & Acquisition</h3>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
            <span style="color: #64748b;">New Sign-ups Acquired:</span>
            <strong style="color: #10b981;">+${d.growth.newSignups}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
            <span style="color: #64748b;">Memberships Expired/Churned:</span>
            <strong style="color: #ef4444;">-${d.growth.churned}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
            <span style="color: #64748b;">Net Growth in Period:</span>
            <strong style="color: ${netGrowth >= 0 ? '#10b981' : '#ef4444'};">${netGrowthStr}</strong>
          </div>
        </div>

        <!-- Attendance Shifts -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #ffffff;">
          <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">🏃 Shift Attendance Distribution</h3>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
            <span style="color: #64748b;">🌅 Morning Shift Check-ins:</span>
            <strong>${d.retention.morningShift} (${morningPct}%)</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
            <span style="color: #64748b;">☀️ Day Shift Check-ins:</span>
            <strong>${d.retention.dayShift} (${dayPct}%)</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
            <span style="color: #64748b;">Total Facility Utilization:</span>
            <strong>${d.retention.totalAttendance} Check-ins</strong>
          </div>
        </div>
      </div>

      <!-- Report Footer -->
      <div style="margin-top: 32px; padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0;">Official Management Report &bull; Fitness Hub Management System &bull; Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
  `;
}

// Helper function to trigger browser download with correct filename
function triggerFileDownload(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 2000);
}

// Generate & Email PDF via Outlook
document.getElementById('generateEmailPdfBtn')?.addEventListener('click', async () => {
  const emailInput = document.getElementById('reportEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) {
    showToast('Please enter a recipient email address', 'error');
    return;
  }
  if (!currentReportData) {
    showToast('Report data is still loading...', 'error');
    return;
  }

  const previewEl = document.getElementById('reportPreviewContainer');
  if (!previewEl) {
    showToast('Report preview not ready', 'error');
    return;
  }

  const btn = document.getElementById('generateEmailPdfBtn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Compiling PDF...';
  }

  showToast('Compiling executive PDF report...', 'success');
  
  const filename = `Gym_Report_${currentReportData.startDate}_to_${currentReportData.endDate}.pdf`;
  
  const opt = {
    margin:       [8, 8, 8, 8],
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    // Generate both datauristring and blob from the rendered visible element
    const pdfBase64 = await html2pdf().set(opt).from(previewEl).outputPdf('datauristring');
    const pdfBlob = await html2pdf().set(opt).from(previewEl).outputPdf('blob');
    
    // Automatically trigger local file download so the user has the physical PDF
    triggerFileDownload(pdfBlob, filename);

    showToast('Opening Outlook email client...', 'success');
    
    const res = await fetch('/api/reports/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        filename: filename,
        pdfDataUri: pdfBase64
      })
    });
    
    const data = await res.json();
    if (res.ok) {
      if (data.method === 'com') {
        showToast('Outlook opened with PDF attached!', 'success');
      } else {
        showToast('PDF downloaded & Email composer opened in Outlook!', 'success');
      }
    } else {
      showToast(data.error || 'Failed to open Outlook email client', 'error');
    }
  } catch (err) {
    console.error('PDF generation error:', err);
    showToast('Error compiling PDF document.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
});

// Download PDF directly
document.getElementById('downloadPdfBtn')?.addEventListener('click', async () => {
  if (!currentReportData) {
    showToast('Report data is still loading...', 'error');
    return;
  }

  const previewEl = document.getElementById('reportPreviewContainer');
  if (!previewEl) {
    showToast('Report preview not ready', 'error');
    return;
  }

  const btn = document.getElementById('downloadPdfBtn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Preparing PDF...';
  }

  showToast('Generating high-resolution PDF...', 'success');

  const filename = `Gym_Report_${currentReportData.startDate}_to_${currentReportData.endDate}.pdf`;

  const opt = {
    margin:       [8, 8, 8, 8],
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    const pdfBlob = await html2pdf().set(opt).from(previewEl).outputPdf('blob');
    triggerFileDownload(pdfBlob, filename);
    showToast('PDF downloaded successfully!', 'success');
  } catch (err) {
    console.error('PDF download error:', err);
    showToast('Failed to download PDF.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
});

// Send PDF Directly via SMTP (1-Click Background Dispatch)
document.getElementById('sendDirectEmailBtn')?.addEventListener('click', async () => {
  const emailInput = document.getElementById('reportEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) {
    showToast('Please enter a recipient email address', 'error');
    return;
  }
  if (!currentReportData) {
    showToast('Report data is still loading...', 'error');
    return;
  }

  const previewEl = document.getElementById('reportPreviewContainer');
  if (!previewEl) {
    showToast('Report preview not ready', 'error');
    return;
  }

  const btn = document.getElementById('sendDirectEmailBtn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Sending PDF...';
  }

  showToast('Compiling & delivering PDF report directly to ' + email + '...', 'success');

  const filename = `Gym_Report_${currentReportData.startDate}_to_${currentReportData.endDate}.pdf`;

  const opt = {
    margin:       [8, 8, 8, 8],
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    const pdfBase64 = await html2pdf().set(opt).from(previewEl).outputPdf('datauristring');

    const res = await fetch('/api/reports/send-direct-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        filename: filename,
        pdfDataUri: pdfBase64
      })
    });

    const data = await res.json();

    if (res.ok) {
      showToast(`🎉 PDF report directly emailed to ${email}!`, 'success');
    } else {
      if (data.error === 'SMTP_NOT_CONFIGURED') {
        showToast('⚠️ Email delivery is not configured yet. Please enter your email in Settings.', 'error');
        setTimeout(() => {
          navigateTo('settings');
          document.getElementById('smtpUser')?.focus();
        }, 1500);
      } else {
        showToast(data.message || 'Failed to send email. Check SMTP settings.', 'error');
      }
    }
  } catch (err) {
    console.error('Direct email dispatch error:', err);
    showToast('Error generating or sending PDF report.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
});

// ═══════════════════════════════════════════════
// SETTINGS PAGE & SMTP CONFIGURATION
// ═══════════════════════════════════════════════
async function loadSettingsPage() {
  try {
    const res = await fetch('/api/reports/smtp-config');
    if (!res.ok) return;
    const config = await res.json();

    const serviceSelect = document.getElementById('smtpService');
    const senderNameInput = document.getElementById('smtpSenderName');
    const userInput = document.getElementById('smtpUser');
    const passInput = document.getElementById('smtpPass');
    const hostInput = document.getElementById('smtpHost');
    const portInput = document.getElementById('smtpPort');
    const statusBadge = document.getElementById('smtpStatusBadge');
    const customFields = document.getElementById('customSmtpFields');

    if (serviceSelect) serviceSelect.value = config.service || 'gmail';
    if (senderNameInput) senderNameInput.value = config.senderName || 'Fitness Hub Management';
    if (userInput) userInput.value = config.user || '';
    if (passInput) passInput.placeholder = config.hasPassword ? '•••••••••••••••• (Saved)' : 'Enter 16-character App Password';
    if (hostInput) hostInput.value = config.host || 'smtp.gmail.com';
    if (portInput) portInput.value = config.port || '587';

    if (customFields) {
      customFields.style.display = config.service === 'custom' ? 'flex' : 'none';
    }

    if (statusBadge) {
      if (config.isConfigured) {
        statusBadge.textContent = '✅ Connected & Configured';
        statusBadge.style.background = '#dcfce7';
        statusBadge.style.color = '#15803d';
      } else {
        statusBadge.textContent = '⚠️ Not Configured';
        statusBadge.style.background = '#fef3c7';
        statusBadge.style.color = '#b45309';
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Toggle custom SMTP fields
document.getElementById('smtpService')?.addEventListener('change', (e) => {
  const customFields = document.getElementById('customSmtpFields');
  const hostInput = document.getElementById('smtpHost');
  const portInput = document.getElementById('smtpPort');

  if (e.target.value === 'custom') {
    if (customFields) customFields.style.display = 'flex';
  } else {
    if (customFields) customFields.style.display = 'none';
    if (e.target.value === 'gmail') {
      if (hostInput) hostInput.value = 'smtp.gmail.com';
      if (portInput) portInput.value = '587';
    } else if (e.target.value === 'outlook') {
      if (hostInput) hostInput.value = 'smtp-mail.outlook.com';
      if (portInput) portInput.value = '587';
    }
  }
});

// Save SMTP Config Form
document.getElementById('smtpConfigForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const service = document.getElementById('smtpService').value;
  const senderName = document.getElementById('smtpSenderName').value;
  const user = document.getElementById('smtpUser').value;
  const pass = document.getElementById('smtpPass').value;
  const host = document.getElementById('smtpHost').value;
  const port = document.getElementById('smtpPort').value;

  try {
    const res = await fetch('/api/reports/smtp-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, senderName, user, pass, host, port })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Email delivery settings saved!', 'success');
      loadSettingsPage();
    } else {
      showToast(data.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  }
});

// Test SMTP Connection
document.getElementById('testSmtpBtn')?.addEventListener('click', async () => {
  const user = document.getElementById('smtpUser').value.trim();
  if (!user) {
    showToast('Please enter your sender email address first', 'error');
    return;
  }

  const btn = document.getElementById('testSmtpBtn');
  const origText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Testing...';
  }

  showToast('Sending test email...', 'success');

  try {
    const res = await fetch('/api/reports/test-smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: user })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      loadSettingsPage();
    } else {
      showToast(data.message || data.error || 'SMTP Test failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }
});


