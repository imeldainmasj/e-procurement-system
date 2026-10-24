import { z } from 'zod';
import { optionalText, requiredText } from './common.schema.js';

/**
 * Application settings stored in `app_settings` (one row per key). The values below are
 * only fallbacks for keys that were never saved; Super Admin changes them in Pengaturan.
 */
export const SETTING_DEFAULTS = {
  COMPANY_NAME: 'PT Perusahaan Contoh',
  COMPANY_ADDRESS: 'Jl. Jenderal Sudirman No. 1, Jakarta',
  PO_DEFAULT_TAX_PERCENT: 11,
  MIN_QUOTATIONS: 3,
  PO_DEFAULT_TERMS:
    'Harga sudah termasuk ongkos kirim ke alamat pengiriman.\n' +
    'Pembayaran dilakukan 30 hari setelah barang diterima lengkap dan invoice diterima.\n' +
    'Barang yang tidak sesuai spesifikasi akan dikembalikan atas biaya vendor.',
};

export const settingsInputSchema = z.object({
  COMPANY_NAME: requiredText('Nama perusahaan', 150),
  COMPANY_ADDRESS: requiredText('Alamat perusahaan', 500),
  PO_DEFAULT_TAX_PERCENT: z.coerce
    .number({ message: 'PPN harus berupa angka' })
    .min(0, { message: 'PPN tidak boleh negatif' })
    .max(100, { message: 'PPN maksimal 100%' }),
  MIN_QUOTATIONS: z.coerce
    .number({ message: 'Jumlah harus berupa angka' })
    .int({ message: 'Jumlah harus bilangan bulat' })
    .min(1, { message: 'Minimal 1 penawaran' })
    .max(10, { message: 'Maksimal 10 penawaran' }),
  PO_DEFAULT_TERMS: optionalText(3000),
});
export type SettingsInput = z.input<typeof settingsInputSchema>;
export type SettingsDto = z.output<typeof settingsInputSchema>;
export type SettingKey = keyof SettingsDto;
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];
