import { z } from 'zod';

/**
 * Thresholds and configuration stored in `app_settings` (CLAUDE.md §5.6), one row per key.
 * These defaults seed the table and back any key that was never saved; admins change the
 * values in Pengaturan. Business rules must read them from the database, never from here.
 */
export const SETTING_DEFAULTS = {
  TENDER_MIN_AMOUNT: 1_000_000_000,
  PVP_MIN_AMOUNT: 500_000_000,
  PVP_MIN_INCREASE_PERCENT: 5,
  PVP_MIN_DIRECTOR_APPROVALS: 2,
  STALE_WORK_DAYS: 7,
  CONTRACT_REMINDER_DAYS: [90, 60, 30],
};

export const SETTING_DESCRIPTIONS: Record<keyof typeof SETTING_DEFAULTS, string> = {
  TENDER_MIN_AMOUNT:
    'Nilai (IDR) di atas ambang ini menggunakan Tender; sama atau di bawahnya Bidding',
  PVP_MIN_AMOUNT: 'Ambang nilai (IDR) PVP Forum',
  PVP_MIN_INCREASE_PERCENT: 'Ambang kenaikan year-on-year (%) PVP Forum',
  PVP_MIN_DIRECTOR_APPROVALS: 'Minimal direktur yang menyetujui agar PVP selesai',
  STALE_WORK_DAYS: 'Pekerjaan dianggap tidak di-update setelah sekian hari',
  CONTRACT_REMINDER_DAYS: 'Pengingat kontrak jatuh tempo (hari sebelum berakhir)',
};

const amountSetting = (label: string) =>
  z.coerce
    .number({ message: `${label} harus berupa angka` })
    .min(0, { message: `${label} tidak boleh negatif` });

const positiveInt = (label: string, max: number) =>
  z.coerce
    .number({ message: `${label} harus berupa angka` })
    .int({ message: `${label} harus bilangan bulat` })
    .min(1, { message: `${label} minimal 1` })
    .max(max, { message: `${label} maksimal ${max}` });

export const settingsInputSchema = z.object({
  TENDER_MIN_AMOUNT: amountSetting('Ambang Tender'),
  PVP_MIN_AMOUNT: amountSetting('Ambang nilai PVP'),
  PVP_MIN_INCREASE_PERCENT: z.coerce
    .number({ message: 'Ambang kenaikan harus berupa angka' })
    .min(0, { message: 'Ambang kenaikan tidak boleh negatif' })
    .max(1000, { message: 'Ambang kenaikan maksimal 1000%' }),
  PVP_MIN_DIRECTOR_APPROVALS: positiveInt('Minimal approval direktur', 20),
  STALE_WORK_DAYS: positiveInt('Batas hari tanpa update', 365),
  CONTRACT_REMINDER_DAYS: z
    .array(positiveInt('Hari pengingat', 730), { message: 'Hari pengingat wajib diisi' })
    .min(1, { message: 'Isi minimal satu hari pengingat' })
    .max(10, { message: 'Maksimal 10 hari pengingat' })
    .transform((days) => [...new Set(days)].sort((a, b) => b - a)),
});
export type SettingsInput = z.input<typeof settingsInputSchema>;
export type SettingsDto = z.output<typeof settingsInputSchema>;
export type SettingKey = keyof SettingsDto;
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];
