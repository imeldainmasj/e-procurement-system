import type { AgreementStatus, Executor, JobLevel, MilestoneType, WorkStatus } from '../enums.js';
import type { StageDto } from './work.schema.js';

/** Compact work row for dashboard widgets and the monitoring board. */
export interface WorkBriefDto {
  id: string;
  code: string;
  title: string;
  status: WorkStatus;
  pic: { id: string; name: string };
  lastUpdatedAt: string;
  isStale: boolean;
  currentStages: StageDto[];
  /** Every current stage is outside IT (other team, directors, officials). */
  waitingOutsideIt: boolean;
}

export interface AgreementBriefDto {
  id: string;
  agreementNo: string;
  title: string;
  vendorName: string;
  effectivePeriodEnd: string;
  daysLeft: number;
  status: AgreementStatus;
}

export interface StaffDashboardDto {
  activeCount: number;
  onHoldCount: number;
  staleDays: number;
  /** My active works not updated for more than staleDays. */
  stale: WorkBriefDto[];
  /** My works whose current stage is with a team outside IT, directors or officials. */
  waitingOutside: WorkBriefDto[];
  /** Largest CONTRACT_REMINDER_DAYS: the "ending soon" window. */
  reminderWindow: number;
  expiringAgreements: AgreementBriefDto[];
}

export interface StageCountDto {
  type: MilestoneType;
  label: string;
  executor: Executor;
  count: number;
}

export interface ManagerDashboardDto {
  year: number;
  staleDays: number;
  reminderWindow: number;
  kpi: {
    active: number;
    onHold: number;
    completedThisYear: number;
    valueThisYear: number;
    /** Same measure last year, for the trend on the KPI tile. */
    valueLastYear: number;
    expiringAgreements: number;
    stale: number;
  };
  workload: { user: { id: string; name: string }; active: number; onHold: number; stale: number }[];
  stale: WorkBriefDto[];
  stageDistribution: StageCountDto[];
  /** Procurement value per procurement year (cancelled works excluded). */
  valueByYear: { year: number; amountIdr: number; count: number }[];
}

export interface TeamMemberDto {
  user: { id: string; name: string; jobLevel: JobLevel };
  active: number;
  onHold: number;
  completed: number;
  stale: number;
  lastUpdateAt: string | null;
  /** The active work waiting longest for an update. */
  oldestWithoutUpdate: { id: string; code: string; title: string; lastUpdatedAt: string } | null;
}

export interface BoardColumnDto {
  type: MilestoneType;
  label: string;
  executor: Executor;
  works: WorkBriefDto[];
}

export interface StaffWorkDto extends WorkBriefDto {
  lastUpdate: { note: string; createdAt: string; author: string } | null;
}

export interface StaffMonitoringDto {
  user: { id: string; name: string; jobLevel: JobLevel };
  works: StaffWorkDto[];
}
