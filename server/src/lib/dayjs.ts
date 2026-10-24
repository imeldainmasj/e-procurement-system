import dayjs from 'dayjs';
import 'dayjs/locale/id.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { env } from '../config/env.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('id');
dayjs.tz.setDefault(env.TZ);

export { dayjs };
