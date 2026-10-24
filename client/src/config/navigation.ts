import {
  ArrowLeftRight,
  BadgeCheck,
  Boxes,
  Building2,
  ClipboardList,
  FileSignature,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Monitor,
  PackageCheck,
  PiggyBank,
  Settings,
  ShoppingCart,
  Tags,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Workflow,
} from 'lucide-react';
import { hasAnyRole, type Role } from '@sipita/shared';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Empty = every authenticated user. SUPER_ADMIN sees everything. */
  roles: Role[];
  /** Shows a live counter next to the label. */
  badge?: 'pendingApprovals';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Single source for the sidebar menu and the role guard of each route (CLAUDE.md §8). */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Menu',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: [] },
      { label: 'Pengajuan', path: '/pengajuan', icon: ClipboardList, roles: [] },
      {
        label: 'Persetujuan',
        path: '/persetujuan',
        icon: BadgeCheck,
        roles: ['APPROVER'],
        badge: 'pendingApprovals',
      },
    ],
  },
  {
    title: 'Pengadaan',
    items: [
      { label: 'Memo Internal', path: '/memo', icon: FileText, roles: ['PROCUREMENT', 'APPROVER'] },
      { label: 'Vendor', path: '/vendor', icon: Truck, roles: ['PROCUREMENT'] },
      {
        label: 'Purchase Order',
        path: '/purchase-order',
        icon: ShoppingCart,
        roles: ['PROCUREMENT'],
      },
      { label: 'Kontrak', path: '/kontrak', icon: FileSignature, roles: ['PROCUREMENT'] },
    ],
  },
  {
    title: 'Gudang & Aset',
    items: [
      { label: 'Stok', path: '/gudang/stok', icon: Boxes, roles: ['WAREHOUSE'] },
      {
        label: 'Penerimaan Barang',
        path: '/gudang/penerimaan',
        icon: PackageCheck,
        roles: ['WAREHOUSE'],
      },
      { label: 'Mutasi Stok', path: '/gudang/mutasi', icon: ArrowLeftRight, roles: ['WAREHOUSE'] },
      { label: 'Aset IT', path: '/aset', icon: Monitor, roles: ['WAREHOUSE'] },
    ],
  },
  {
    title: 'Laporan',
    items: [
      {
        label: 'Riwayat Harga',
        path: '/harga',
        icon: TrendingUp,
        roles: ['PROCUREMENT', 'VIEWER'],
      },
      { label: 'Anggaran', path: '/anggaran', icon: PiggyBank, roles: ['PROCUREMENT', 'VIEWER'] },
    ],
  },
  {
    title: 'Pengaturan',
    items: [
      { label: 'Pengguna', path: '/pengaturan/pengguna', icon: Users, roles: ['SUPER_ADMIN'] },
      { label: 'Divisi', path: '/pengaturan/divisi', icon: Building2, roles: ['SUPER_ADMIN'] },
      { label: 'Katalog Item', path: '/pengaturan/item', icon: Tags, roles: ['SUPER_ADMIN'] },
      {
        label: 'Aturan Approval',
        path: '/pengaturan/aturan-approval',
        icon: Workflow,
        roles: ['SUPER_ADMIN'],
      },
      { label: 'Gudang', path: '/pengaturan/gudang', icon: Warehouse, roles: ['SUPER_ADMIN'] },
      { label: 'Umum', path: '/pengaturan/umum', icon: Settings, roles: ['SUPER_ADMIN'] },
    ],
  },
];

/** Sections and items visible to a user with `roles`; empty sections are dropped. */
export function getVisibleNav(roles: readonly Role[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasAnyRole(roles, item.roles)),
  })).filter((section) => section.items.length > 0);
}
