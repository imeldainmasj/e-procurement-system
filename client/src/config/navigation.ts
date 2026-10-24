import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileSignature,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Route,
  Settings,
  TrendingUp,
  Truck,
  Users,
  UsersRound,
} from 'lucide-react';
import { canAccess, type AccessSubject, type Feature } from '@sipita/shared';

/** Who may open a page: a feature's view permission, or admins only (CLAUDE.md §4, §10). */
export type NavAccess = { feature: Feature } | 'admin';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  access: NavAccess;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Single source for the sidebar menu and the guard of each route (CLAUDE.md §10). */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Menu',
    items: [
      {
        label: 'Dashboard',
        path: '/',
        icon: LayoutDashboard,
        access: { feature: 'DASHBOARD' },
      },
      {
        label: 'Pekerjaan Saya',
        path: '/pekerjaan/saya',
        icon: ListChecks,
        access: { feature: 'WORK' },
      },
      {
        label: 'Semua Pekerjaan',
        path: '/pekerjaan',
        icon: Briefcase,
        access: { feature: 'WORK' },
      },
      {
        label: 'Monitoring Tim',
        path: '/monitoring',
        icon: UsersRound,
        access: { feature: 'MONITORING' },
      },
    ],
  },
  {
    title: 'Pengadaan',
    items: [
      { label: 'Kontrak', path: '/kontrak', icon: FileSignature, access: { feature: 'AGREEMENT' } },
      { label: 'Vendor', path: '/vendor', icon: Truck, access: { feature: 'VENDOR' } },
      {
        label: 'Import Excel',
        path: '/import',
        icon: FileSpreadsheet,
        access: { feature: 'IMPORT' },
      },
    ],
  },
  {
    title: 'Report',
    items: [
      {
        label: 'Rekap Tahunan',
        path: '/report/rekap-tahunan',
        icon: BarChart3,
        access: { feature: 'REPORT' },
      },
      {
        label: 'Tren Year-to-Year',
        path: '/report/tren',
        icon: TrendingUp,
        access: { feature: 'REPORT' },
      },
      {
        label: 'Jatuh Tempo',
        path: '/report/jatuh-tempo',
        icon: CalendarClock,
        access: { feature: 'REPORT' },
      },
      {
        label: 'Riwayat Vendor',
        path: '/report/vendor',
        icon: Truck,
        access: { feature: 'REPORT' },
      },
      {
        label: 'Kepatuhan',
        path: '/report/kepatuhan',
        icon: ClipboardCheck,
        access: { feature: 'REPORT' },
      },
      {
        label: 'Kinerja Tim',
        path: '/report/kinerja-tim',
        icon: Gauge,
        access: { feature: 'REPORT' },
      },
    ],
  },
  {
    title: 'Pengaturan',
    items: [
      { label: 'Pengguna & Akses', path: '/pengaturan/pengguna', icon: Users, access: 'admin' },
      { label: 'Organisasi', path: '/pengaturan/organisasi', icon: Building2, access: 'admin' },
      {
        label: 'Template Milestone',
        path: '/pengaturan/template-milestone',
        icon: Route,
        access: 'admin',
      },
      { label: 'Ambang & Pengaturan', path: '/pengaturan/umum', icon: Settings, access: 'admin' },
    ],
  },
];

export function hasNavAccess(subject: AccessSubject, access: NavAccess): boolean {
  if (access === 'admin') return subject.isAdmin;
  return canAccess(subject, access.feature, 'view');
}

/** Sections and items visible to `subject`; empty sections are dropped. */
export function getVisibleNav(subject: AccessSubject): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasNavAccess(subject, item.access)),
  })).filter((section) => section.items.length > 0);
}
