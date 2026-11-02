// Single source of truth for demo data. Shapes mirror database/schema.sql.
// Fictional company: Aravalli Industries Ltd. Fixed dates; "today" is DEMO_TODAY.
import type {
  Dataset, Department, Employee, Incident, IncidentStatus, IncidentUpdate,
  Risk, RiskAssessment, RiskCategory, RiskStatus, Role, Severity,
} from '../types';
import { computeScore } from '../scoring';

const pad = (n: number, w = 4) => String(n).padStart(w, '0');

function addHours(ts: string, h: number): string {
  const d = new Date(ts + 'Z');
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(h * 60));
  return d.toISOString().slice(0, 19);
}

// ---------------------------------------------------------------- departments
const DEPTS: [string, string][] = [
  ['FIN', 'Finance'], ['IT', 'IT'], ['OPS', 'Operations'], ['SCM', 'Supply Chain'],
  ['HR', 'HR'], ['LGL', 'Legal & Compliance'], ['SLS', 'Sales'], ['FAC', 'Facilities'],
];
const departments: Department[] = DEPTS.map(([code, name], i) => ({
  department_id: i + 1, code, name, created_at: '2025-10-15T09:00:00',
}));
const deptId = (code: string) => departments.find((d) => d.code === code)!.department_id;

// ------------------------------------------------------------------ employees
// [first, last, dept, job title, role]; employee_id = position (1-based)
const EMP: [string, string, string, string, Role][] = [
  ['Rajesh', 'Khanna', 'FIN', 'Head of Finance', 'Department Head'],
  ['Meera', 'Iyer', 'FIN', 'Enterprise Risk Manager', 'Risk Officer'],
  ['Sandeep', 'Joshi', 'FIN', 'Internal Auditor', 'Auditor'],
  ['Pooja', 'Nair', 'FIN', 'Accounts Payable Executive', 'Employee'],
  ['Vikram', 'Malhotra', 'IT', 'Chief Information Officer', 'Department Head'],
  ['Ananya', 'Reddy', 'IT', 'Information Security Analyst', 'Employee'],
  ['Arjun', 'Menon', 'IT', 'IT Systems Administrator', 'Administrator'],
  ['Kiran', 'Patel', 'IT', 'ERP Functional Analyst', 'Employee'],
  ['Harpreet', 'Singh', 'OPS', 'VP Operations', 'Department Head'],
  ['Deepak', 'Chauhan', 'OPS', 'Plant Manager, Bhiwadi', 'Employee'],
  ['Suresh', 'Yadav', 'OPS', 'Maintenance Supervisor', 'Employee'],
  ['Neha', 'Kapoor', 'OPS', 'Operational Risk Officer', 'Risk Officer'],
  ['Amit', 'Bansal', 'SCM', 'Head of Supply Chain', 'Department Head'],
  ['Rohit', 'Sharma', 'SCM', 'Procurement Manager', 'Employee'],
  ['Lakshmi', 'Pillai', 'SCM', 'Logistics Coordinator', 'Employee'],
  ['Imran', 'Qureshi', 'SCM', 'Warehouse Supervisor, Jaipur DC', 'Employee'],
  ['Sunita', 'Rao', 'HR', 'Chief Human Resources Officer', 'Department Head'],
  ['Anil', 'Gupta', 'HR', 'HR Business Partner', 'Employee'],
  ['Divya', 'Menon', 'HR', 'Payroll Specialist', 'Employee'],
  ['Faisal', 'Ahmed', 'HR', 'Talent Acquisition Lead', 'Employee'],
  ['Priyanka', 'Deshmukh', 'LGL', 'General Counsel', 'Department Head'],
  ['Karthik', 'Subramanian', 'LGL', 'Compliance Auditor', 'Auditor'],
  ['Ritu', 'Agarwal', 'LGL', 'Compliance Risk Officer', 'Risk Officer'],
  ['Manish', 'Tiwari', 'LGL', 'Contracts Manager', 'Employee'],
  ['Gaurav', 'Mehta', 'SLS', 'Head of Sales', 'Department Head'],
  ['Shalini', 'Verma', 'SLS', 'Key Account Manager', 'Employee'],
  ['Tarun', 'Bhatia', 'SLS', 'Regional Sales Manager, West', 'Employee'],
  ['Nisha', 'Choudhary', 'SLS', 'Sales Operations Analyst', 'Employee'],
  ['Rakesh', 'Pandey', 'FAC', 'Head of Facilities', 'Department Head'],
  ['Bhavna', 'Solanki', 'FAC', 'EHS Officer', 'Employee'],
  ['Mohan', 'Das', 'FAC', 'Facilities Engineer', 'Employee'],
  ['Jyoti', 'Saxena', 'FAC', 'Security & Administration Officer', 'Employee'],
];
const employees: Employee[] = EMP.map(([first, last, dept, title, role], i) => ({
  employee_id: i + 1,
  employee_code: `EMP-${1001 + i}`,
  department_id: deptId(dept),
  first_name: first,
  last_name: last,
  email: `${first}.${last}@aravalli-industries.example`.toLowerCase(),
  job_title: title,
  role,
  is_active: true,
  created_at: '2025-10-15T09:00:00',
}));
const empName = (id: number) => `${employees[id - 1].first_name} ${employees[id - 1].last_name}`;

// ---------------------------------------------------------------------- risks
// [title, description, category, owner id, status, identified_date, assessments]
// assessment: [date, likelihood, impact, assessed_by, note | null]
type A = [string, number, number, number, string | null];
type R = [string, string, RiskCategory, number, RiskStatus, string, A[]];

const RISK_DATA: R[] = [
  ['Single-source dependency on resin supplier for Line 3',
    'Line 3 moulding depends on one polymer grade from a single supplier with no qualified alternate. A supply interruption halts about 28% of plant output.',
    'Operational', 14, 'Mitigating', '2025-11-04', [
      ['2025-11-12', 3, 5, 2, 'Line 3 runs on one grade from one supplier; no qualified alternate exists.'],
      ['2026-02-10', 4, 4, 2, 'Port congestion raised lead-time variability; buffer stock cut to 9 days.'],
      ['2026-06-15', 3, 4, 14, 'Alternate supplier trial batch approved for 30% of volume; buffer lifted to 21 days.'],
      ['2026-09-18', 3, 3, 14, null]]],
  ['Vendor payment approval bypass in ERP',
    'Users holding both payment-create and payment-release roles can push vendor payments without a second approver, enabling error or fraud.',
    'Compliance', 1, 'Mitigating', '2025-11-10', [
      ['2025-11-18', 4, 4, 2, 'Approval workflow can be bypassed by users holding both create and release roles.'],
      ['2026-03-04', 4, 5, 3, 'Internal audit found 11 bypass cases in Q4; segregation-of-duties rules not enforced.'],
      ['2026-06-02', 4, 5, 2, 'Interim compensating review of payments above ₹5 lakh introduced.'],
      ['2026-08-20', 4, 5, 2, 'SoD rule set built in ERP; go-live pending user acceptance testing.']]],
  ['Expired ISO 27001 surveillance audit actions',
    'Corrective actions raised in the ISO 27001 surveillance audit passed their due dates, putting certification at risk.',
    'Compliance', 5, 'Mitigating', '2025-11-12', [
      ['2025-11-20', 3, 4, 23, 'Surveillance audit raised six minor non-conformities; four are past due.'],
      ['2026-03-12', 3, 3, 23, 'Two actions closed; asset inventory and access-review gaps remain.'],
      ['2026-05-22', 2, 4, 5, 'Access review completed for ERP and file servers.'],
      ['2026-07-10', 2, 4, 5, null]]],
  ['Phishing compromise of finance mailboxes',
    'Targeted phishing against Accounts Payable and Treasury staff can lead to mailbox takeover, invoice redirection and payment fraud.',
    'Technology', 6, 'Mitigating', '2025-11-15', [
      ['2025-11-24', 4, 4, 2, 'Two finance staff clicked simulated phishing links in the last drill.'],
      ['2025-12-20', 4, 5, 5, 'Real compromise of an AP clerk mailbox on 3 December; MFA gaps found.'],
      ['2026-04-02', 3, 5, 5, 'MFA enforced on finance; impersonation still possible via OAuth consent grants.'],
      ['2026-09-14', 4, 5, 2, 'Second attempt reached a Treasury executive; conditional access review under way.']]],
  ['Cold-storage temperature excursions at Jaipur DC',
    'The Jaipur distribution centre cold room has a single refrigeration unit; excursions spoil temperature-sensitive stock and breach customer quality terms.',
    'Operational', 16, 'Mitigating', '2025-11-18', [
      ['2025-11-27', 3, 4, 12, 'Single refrigeration unit with no temperature alarms outside shift hours.'],
      ['2026-01-08', 3, 4, 16, 'Alarm and SMS escalation fitted after the December excursion.'],
      ['2026-05-12', 3, 4, 16, null],
      ['2026-09-08', 4, 4, 12, 'Compressor trip on 5 September showed the standby unit does not auto-start.']]],
  ['Rupee depreciation on imported polymer feedstock',
    'About 35% of raw material cost is USD-linked. Sharp INR depreciation compresses margin before price changes can be passed on.',
    'Financial', 1, 'Monitoring', '2025-11-20', [
      ['2025-12-02', 4, 3, 2, null],
      ['2026-03-17', 3, 3, 1, 'Quarterly forward cover raised to 60% of forecast imports.'],
      ['2026-05-19', 3, 3, 1, 'Natural hedge from export receivables covers about 40% of exposure.']]],
  ['Unplanned downtime of Line 2 extrusion press',
    'The Line 2 extrusion press is beyond its overhaul interval; failure would stop output and delay customer orders.',
    'Operational', 11, 'Mitigating', '2025-12-01', [
      ['2025-12-10', 4, 4, 12, 'Line 2 press has run 9,400 hours since overhaul against an 8,000 hour interval.'],
      ['2026-04-28', 5, 4, 12, 'Gearbox failure on 20 April confirmed the overdue overhaul risk.'],
      ['2026-08-25', 3, 4, 9, 'Gearbox replaced; condition-monitoring sensors being installed.']]],
  ['GST input tax credit mismatches in GSTR-2B reconciliation',
    'Supplier filing gaps cause input tax credit mismatches, leading to blocked credit and potential interest.',
    'Compliance', 4, 'Assessed', '2025-12-04', [
      ['2025-12-15', 3, 3, 3, 'ITC mismatch averaged 2.3% of eligible credit in Q2 FY26.'],
      ['2026-03-26', 3, 2, 4, 'Monthly vendor follow-up cut mismatches below 1.5%.'],
      ['2026-06-25', 2, 2, 4, null]]],
  ['Key-person dependency in plant maintenance',
    'Three technicians hold nearly all knowledge of die changeover and press calibration; their absence delays recovery from faults.',
    'Operational', 9, 'Mitigating', '2025-12-08', [
      ['2025-12-18', 4, 3, 12, 'Three technicians hold all die changeover knowledge.'],
      ['2026-03-11', 4, 3, 9, 'Standard work instructions drafted for the top ten changeovers.'],
      ['2026-05-14', 3, 3, 9, 'Cross-training under way for two additional technicians.'],
      ['2026-10-05', 3, 2, 9, null]]],
  ['Unpatched legacy SCADA servers at Bhiwadi plant',
    'SCADA servers run an unsupported operating system without vendor patches and are reachable from the corporate network.',
    'Technology', 8, 'Mitigating', '2025-12-12', [
      ['2025-12-22', 4, 5, 2, 'SCADA servers run Windows Server 2012 R2 without vendor patches.'],
      ['2026-03-30', 5, 4, 5, 'An exploit for the SCADA gateway software is now public.'],
      ['2026-09-30', 5, 4, 2, 'Network segmentation done; OS upgrade deferred to the March shutdown.']]],
  ['Non-compliance with Contract Labour (R&A) Act records',
    'Wage registers and licence records for contract workers are incomplete for several principal contractors.',
    'Compliance', 18, 'Monitoring', '2026-01-05', [
      ['2026-01-14', 3, 4, 23, 'Contractor wage and licence records incomplete for 3 of 9 principal contractors.'],
      ['2026-04-09', 3, 3, 18, 'Two of three gaps closed; third contractor on notice.'],
      ['2026-07-20', 2, 3, 23, 'Records now audited monthly.']]],
  ['Attrition of skilled CNC operators',
    'Skilled CNC operators are leaving for competitors, slowing throughput and raising rework.',
    'Operational', 17, 'Mitigating', '2026-01-08', [
      ['2026-01-20', 4, 3, 2, 'Attrition of CNC operators at 22% annualised.'],
      ['2026-06-02', 4, 3, 17, 'Retention bonus pilot launched at Bhiwadi.'],
      ['2026-08-11', 4, 3, 17, null],
      ['2026-09-29', 4, 4, 17, 'Two resignations in August; a competitor is offering an 18% pay uplift.']]],
  ['Customer concentration: top three distributors at 41% of revenue',
    'Loss or renegotiation by any of the top three distributors would materially cut revenue.',
    'Strategic', 25, 'Assessed', '2026-01-12', [
      ['2026-01-27', 3, 5, 2, 'Top three distributors account for 41% of FY26 revenue.'],
      ['2026-05-06', 3, 5, 25, 'Two new regional distributors signed but under 4% of revenue.'],
      ['2026-08-10', 3, 5, 25, null]]],
  ['Delayed trade receivables from state dairy cooperatives',
    'State cooperatives pay late, stretching working capital and increasing bad-debt exposure.',
    'Financial', 26, 'Mitigating', '2026-01-15', [
      ['2026-02-03', 4, 3, 2, 'Average collection period from state dairy cooperatives is 118 days.'],
      ['2026-07-14', 4, 3, 26, 'Escalation to state finance departments released ₹3.1 crore.'],
      ['2026-10-01', 3, 3, 26, null]]],
  ['Data privacy obligations under the DPDP Act not mapped',
    'No data inventory or processing register exists for customer and employee personal data.',
    'Compliance', 21, 'Mitigating', '2026-01-20', [
      ['2026-02-02', 4, 4, 23, 'No data inventory or processing register exists.'],
      ['2026-04-14', 4, 4, 21, 'Privacy impact workshops held with HR and Sales.'],
      ['2026-06-18', 3, 4, 21, 'Data mapping completed for HR and Sales; Finance and IT outstanding.']]],
  ['Fire safety system maintenance lapses at Neemrana warehouse',
    'Fire pump tests and alarm maintenance at the Neemrana warehouse have been skipped, risking injury and insurance repudiation.',
    'Operational', 30, 'Mitigating', '2026-01-26', [
      ['2026-02-05', 3, 5, 12, 'Quarterly fire pump test skipped twice at Neemrana.'],
      ['2026-02-28', 3, 5, 30, 'Alarm panel fault on 21 February; AMC vendor took three days to respond.'],
      ['2026-05-20', 3, 5, 30, null],
      ['2026-08-12', 2, 5, 30, 'AMC renegotiated with a 4-hour response; pump tests back on schedule.']]],
  ['Counterfeit product circulating in tier-2 markets',
    'Counterfeit packs sold in tier-2 towns damage brand trust and expose customers to unsafe product.',
    'Reputational', 27, 'Monitoring', '2026-02-02', [
      ['2026-02-16', 3, 4, 2, 'Counterfeits reported in Nagpur and Raipur retail.'],
      ['2026-05-30', 3, 3, 27, 'Hologram labels introduced on the top six SKUs.'],
      ['2026-09-02', 2, 3, 27, null]]],
  ['Backup restoration never tested for ERP database',
    'ERP database backups have not been restored in a test environment; recovery capability is unproven.',
    'Technology', 7, 'Mitigating', '2026-02-05', [
      ['2026-02-18', 3, 5, 5, 'ERP database backup has never been restored in a test environment.'],
      ['2026-03-09', 4, 5, 5, 'Restore test on 5 March failed; backups were incomplete.'],
      ['2026-06-24', 2, 5, 7, 'Backup job fixed; quarterly restore tests calendarised.'],
      ['2026-07-22', 3, 5, 5, 'Storage controller fault on 15 July exposed a single point of failure.']]],
  ['Contract auto-renewal clauses unmanaged for logistics vendors',
    'Auto-renewal clauses in logistics contracts roll over unnoticed, locking in unfavourable rates.',
    'Compliance', 24, 'Closed', '2026-02-09', [
      ['2026-02-20', 3, 3, 23, null],
      ['2026-04-22', 2, 3, 24, 'Renewal calendar drafted for the 14 logistics contracts.'],
      ['2026-06-10', 2, 2, 24, 'Renewal calendar live; all 14 logistics contracts reviewed.']]],
  ['Monsoon flooding of Gurugram distribution yard',
    'The Gurugram yard has no drainage outlet; waterlogging stops dispatch and damages stock.',
    'Operational', 31, 'Assessed', '2026-03-01', [
      ['2026-03-12', 4, 4, 12, 'Gurugram yard has no drainage outlet; two of the last three monsoons caused waterlogging.'],
      ['2026-05-27', 4, 4, 31, null],
      ['2026-07-09', 4, 3, 31, 'Temporary pumps hired; permanent drain approved in capex.']]],
  ['Ransomware exposure through unmanaged contractor laptops',
    'About 40 contractor laptops sit outside endpoint management and connect to plant and office networks.',
    'Technology', 6, 'Mitigating', '2026-03-10', [
      ['2026-03-24', 4, 4, 5, 'Roughly 40 contractor laptops sit outside endpoint management.'],
      ['2026-06-01', 4, 5, 5, 'Malware beaconing seen on a contractor device.'],
      ['2026-09-21', 5, 4, 5, 'EDR rollout only 55% complete.']]],
  ['Inaccurate inventory valuation at third-party warehouses',
    'Count variances at third-party warehouses distort inventory valuation and period-end results.',
    'Financial', 1, 'Assessed', '2026-03-15', [
      ['2026-03-28', 3, 3, 3, 'Count variances at the Bhiwandi 3PL warehouse run at 1.8% of stock value.'],
      ['2026-06-20', 3, 4, 1, 'Variance repeated in the June cycle count.']]],
  ['Pollution control board consent-to-operate renewal delay',
    'Renewal of the Bhiwadi consent to operate takes about nine months; a lapse would stop production.',
    'Compliance', 23, 'Assessed', '2026-03-22', [
      ['2026-04-06', 3, 4, 23, 'Consent to operate expires in May 2027; renewal averages nine months.']]],
  ['Inbound freight cost volatility from diesel price spikes',
    'Diesel price swings push freight cost above budget because most carrier rates float.',
    'Financial', 15, 'Monitoring', '2026-04-01', [
      ['2026-04-14', 3, 3, 12, null],
      ['2026-09-10', 3, 2, 15, 'Diesel surcharge clauses added to two carrier contracts.']]],
  ['Product recall readiness gaps',
    'No mock recall exercise has been run in three years; batch traceability is untested.',
    'Reputational', 10, 'Mitigating', '2026-04-08', [
      ['2026-04-22', 3, 5, 12, 'No mock recall exercise in three years.'],
      ['2026-06-30', 3, 4, 10, 'Recall procedure rewritten and approved.'],
      ['2026-08-18', 3, 4, 10, 'Mock recall completed; batch traceability in 3h 40m against a 4h target.']]],
  ['Regional sales team misreporting rebate accruals',
    'Rebate accruals are maintained manually by region and can be understated or overstated.',
    'Financial', 28, 'Assessed', '2026-04-15', [
      ['2026-04-29', 3, 3, 3, 'Rebate accrual workbook is maintained manually by region.']]],
  ['Social media backlash on packaging sustainability claims',
    'Sustainability claims on packaging may be challenged as unsubstantiated, drawing public criticism.',
    'Reputational', 26, 'Identified', '2026-04-20', []],
  ['Workplace injury at press shop from missing machine guarding',
    'Three press-shop machines lack interlocked guards, exposing operators to serious injury.',
    'Operational', 30, 'Mitigating', '2026-03-20', [
      ['2026-04-06', 4, 4, 12, 'Three press-shop machines lack interlocked guards.'],
      ['2026-07-02', 4, 4, 30, 'Interim light curtains placed on the highest-use machine.'],
      ['2026-09-03', 3, 4, 30, 'Guards fitted on two machines; the third awaits an OEM kit.']]],
  ['Insider access to payroll master data',
    'Payroll master data can be edited by nine users without maker-checker control.',
    'Technology', 19, 'Assessed', '2026-05-04', [
      ['2026-05-15', 3, 4, 23, 'Payroll master data editable by nine users with no maker-checker.'],
      ['2026-08-05', 3, 4, 19, 'Access list cut to five users; maker-checker not yet configured.']]],
  ['New competitor entry with import-parity pricing',
    'An importer has announced an Indian plant and import-parity pricing, which may pressure our share.',
    'Strategic', 25, 'Monitoring', '2026-05-11', [
      ['2026-05-25', 3, 4, 2, 'Importer announced an Indian plant with import-parity pricing.']]],
  ['Dependence on single freight forwarder for export shipments',
    'One forwarder handles all export bookings and customs filings.',
    'Operational', 13, 'Assessed', '2026-05-18', [
      ['2026-06-02', 3, 4, 12, 'One forwarder handles all export bookings.'],
      ['2026-08-02', 3, 4, 13, 'Second forwarder onboarding started after the Mundra documentation hold.']]],
  ['Capital project overrun on Bhiwadi Phase II expansion',
    'The Phase II expansion is running over budget and behind schedule.',
    'Strategic', 9, 'Assessed', '2026-05-25', [
      ['2026-06-08', 3, 4, 2, 'Bhiwadi Phase II is 14% over budget at 40% completion.'],
      ['2026-09-15', 4, 4, 9, 'Revised estimate adds ₹6.8 crore; steering committee review scheduled.']]],
  ['Anti-bribery due diligence gaps for channel partners',
    'Due diligence files are missing for a large share of channel partners.',
    'Compliance', 21, 'Mitigating', '2026-06-01', [
      ['2026-06-12', 3, 5, 23, 'Due diligence file missing for 11 of 38 channel partners.'],
      ['2026-08-07', 3, 5, 21, null],
      ['2026-09-17', 3, 5, 21, 'Anti-bribery declarations collected from 27 partners.']]],
  ['Power failure at primary data room',
    'A single UPS fed the primary data room, so a power event could take down core systems.',
    'Technology', 5, 'Closed', '2026-06-05', [
      ['2026-06-15', 3, 4, 5, 'Single UPS feeds the primary data room.'],
      ['2026-08-03', 2, 4, 5, 'Redundant UPS ordered.'],
      ['2026-09-09', 1, 4, 5, 'Redundant UPS commissioned and tested.']]],
  ['Delayed statutory PF/ESI filings',
    'Late provident fund and ESI filings attract penalties and interest.',
    'Compliance', 19, 'Closed', '2025-12-10', [
      ['2025-12-20', 3, 3, 23, 'Two challans filed late in Q3.'],
      ['2026-03-10', 2, 3, 19, null],
      ['2026-08-04', 1, 3, 19, 'Filing automation live; three consecutive on-time months.']]],
  ['Forex hedging policy not reviewed since 2024',
    'The treasury hedging policy predates current exposures and limits.',
    'Financial', 1, 'Assessed', '2026-06-18', [
      ['2026-07-01', 3, 4, 2, 'Hedging policy last reviewed in March 2024; limits predate current exposure.']]],
  ['Tooling obsolescence in Line 1 moulding',
    'Line 1 moulds average eleven years in service, with two showing cracked cavities.',
    'Strategic', 10, 'Assessed', '2026-06-20', [
      ['2026-07-06', 3, 3, 12, 'Line 1 moulds average 11 years; two have cracked cavities.']]],
  ['Unauthorised visitor access at head-office reception',
    'Visitors can reach office floors without badge control during peak hours.',
    'Operational', 32, 'Identified', '2026-09-01', []],
  ['Weak supplier quality audit coverage',
    'Fewer than a third of critical suppliers have had a quality audit in the past two years.',
    'Operational', 14, 'Identified', '2026-09-20', []],
  ['Absence of a board-approved risk appetite statement',
    'Risk tolerances are set informally by each function; the board has not approved an enterprise-wide appetite.',
    'Strategic', 2, 'Assessed', '2026-09-25', [
      ['2026-10-08', 3, 4, 2, 'No board-approved risk appetite statement; tolerances set informally.']]],
];

const risks: Risk[] = [];
const risk_assessments: RiskAssessment[] = [];
RISK_DATA.forEach(([title, description, category, owner, status, identified, assessments], i) => {
  const risk_id = i + 1;
  const owner_emp = employees[owner - 1];
  const last = assessments.length ? assessments[assessments.length - 1][0] : identified;
  risks.push({
    risk_id, risk_code: `RSK-${pad(risk_id)}`, title, description, category,
    department_id: owner_emp.department_id, owner_employee_id: owner, status,
    identified_date: identified, created_at: `${identified}T09:00:00`, updated_at: `${last}T11:00:00`,
  });
  assessments.forEach(([date, likelihood, impact, by, note]) => {
    risk_assessments.push({
      assessment_id: risk_assessments.length + 1, risk_id, assessed_by: by,
      assessment_date: date, likelihood, impact, risk_score: computeScore(likelihood, impact),
      mitigation_notes: note, created_at: `${date}T11:00:00`,
    });
  });
});

// ------------------------------------------------------------------ incidents
// Steps: "hoursAfterPreviousEvent|updated_by|newStatus or -|text"
interface IncSpec {
  t: string; d: string; sev: Severity; dept: string; rep: number; asg: number | null;
  risk: number | null; occ: string; lag: number; steps: string[];
}
const I: IncSpec[] = [
  { t: 'Resin lot rejected on Line 3 for moisture content', d: 'Incoming resin lot from the sole supplier failed the moisture check at the Bhiwadi receiving lab; Line 3 had under two days of cover left.', sev: 'High', dept: 'OPS', rep: 10, asg: 14, risk: 1, occ: '2025-11-06T14:20:00', lag: 1.5, steps: [
    '3|14|Investigating|Supplier certificate of analysis reviewed; retained samples sent to the in-house lab for Karl Fischer testing.',
    '30|14|-|Lab confirms moisture at 0.41% against a 0.05% limit. All 18 MT of the lot are quarantined.',
    '26|9|Resolved|Lot returned to supplier against credit note; replacement lot passed inspection and Line 3 resumed after 31 hours.',
    '120|2|Closed|Closed after the supplier issued a corrective action report and a drying check was added to the dispatch checklist.'] },
  { t: 'Duplicate vendor invoice paid twice', d: 'Accounts Payable released two payments of ₹7.4 lakh against the same packaging vendor invoice submitted under different reference numbers.', sev: 'Medium', dept: 'FIN', rep: 4, asg: 1, risk: 2, occ: '2025-11-19T09:05:00', lag: 5, steps: [
    '4|1|Investigating|Payment run reports pulled; both invoices carry identical amounts and PO but different invoice numbers.',
    '22|1|-|Vendor contacted; they confirm the second invoice was a resubmission after a portal error.',
    '48|1|Resolved|Vendor refunded ₹7.4 lakh to our account; duplicate-check rule on PO and amount added in ERP.',
    '72|2|Closed|Refund reconciled in the bank statement; closed.'] },
  { t: 'Phishing compromise of AP clerk mailbox', d: 'The mailbox of an Accounts Payable clerk was taken over after a credential-harvesting email and used to send bank-detail change requests to three vendors.', sev: 'Critical', dept: 'IT', rep: 6, asg: 5, risk: 4, occ: '2025-12-03T16:45:00', lag: 2, steps: [
    '1|5|Investigating|Mailbox session revoked and password reset; mail-flow logs requested from the email provider.',
    '6|6|-|Forwarding rule to an external address found and removed; three vendors identified as recipients.',
    '14|5|Contained|Vendors called back on known numbers; none had changed bank details. No payments were diverted.',
    '70|5|Resolved|Forensic review shows no further access. MFA enforced for all finance mailboxes.',
    '168|2|Closed|Post-incident review completed and shared with Finance leadership.'] },
  { t: 'Cold-storage temperature excursion at Jaipur DC', d: 'Cold-room temperature rose to 14°C for about five hours overnight after the compressor tripped; no alarm reached the shift supervisor.', sev: 'High', dept: 'SCM', rep: 16, asg: 15, risk: 5, occ: '2025-12-14T02:10:00', lag: 6, steps: [
    '2|15|Investigating|Compressor restarted; stock in the affected zone placed on hold pending quality review.',
    '40|15|Resolved|Quality released 70% of stock; 38 pallets destroyed. Temperature alarm with SMS escalation ordered.',
    '30|16|Investigating|Reopened: customer returned one released batch with a temperature-indicator failure.',
    '20|15|Resolved|Returned batch destroyed and credited. Release criteria tightened to indicator-based checks.',
    '96|12|Closed|Closed after the alarm system was installed and tested.'] },
  { t: 'Tailgating observed at head-office reception', d: 'A contractor without a badge followed an employee through the turnstile and reached the third floor before being challenged.', sev: 'Low', dept: 'FAC', rep: 32, asg: 29, risk: null, occ: '2025-12-29T11:30:00', lag: 1, steps: [
    '5|29|Investigating|CCTV reviewed; the visitor was a vendor engineer expecting an escort.',
    '24|29|Resolved|Visitor escorts made mandatory; reception briefing delivered to the guard team.',
    '48|29|Closed|Closed with no further action.'] },
  { t: 'Hydraulic leak on Line 2 press', d: 'Hydraulic oil leaked from the main ram seal on the Line 2 press, forcing an emergency stop during the morning shift.', sev: 'Medium', dept: 'OPS', rep: 11, asg: 11, risk: 7, occ: '2026-01-12T07:40:00', lag: 0.5, steps: [
    '1|11|Investigating|Press isolated; oil spill contained and cleaned by the maintenance team.',
    '9|11|-|Ram seal found worn; spare kit available in stores.',
    '14|11|Resolved|Seal replaced and pressure-tested; Line 2 back in production after 11 hours.',
    '72|12|Closed|Seal wear logged against the overhaul plan; closed.'] },
  { t: 'Late PF challan attracts interest and penalty', d: 'The December provident fund challan was paid four days after the due date, creating interest and a penalty notice.', sev: 'High', dept: 'HR', rep: 19, asg: 18, risk: 35, occ: '2026-01-27T13:15:00', lag: 3, steps: [
    '5|18|Investigating|Cause traced to a delayed payroll approval and a missing digital signature token.',
    '50|18|Resolved|Penalty of ₹46,000 paid; calendar reminders and a backup signatory configured.',
    '96|17|Closed|Closed after a clean February filing.'] },
  { t: 'Auto-renewal of transport contract missed', d: 'The annual contract with a regional transporter renewed automatically at a 6% higher rate because the notice window was missed.', sev: 'Medium', dept: 'LGL', rep: 24, asg: 23, risk: 19, occ: '2026-02-09T10:00:00', lag: 24, steps: [
    '6|23|Investigating|Contract reviewed; notice period ended 12 days before renewal.',
    '52|24|Resolved|Transporter agreed to hold the old rate for six months; renewal calendar initiated for all logistics contracts.',
    '96|23|Closed|Renewal calendar reviewed by Legal; no further action on this contract.'] },
  { t: 'Fire alarm panel fault at Neemrana warehouse', d: 'The fire alarm panel at Neemrana showed a persistent fault for three days before the AMC vendor attended.', sev: 'High', dept: 'FAC', rep: 31, asg: 30, risk: 16, occ: '2026-02-21T18:25:00', lag: 4, steps: [
    '3|30|Investigating|Fire watch posted at the warehouse until the panel is repaired.',
    '52|30|-|Vendor replaced a failed loop card and tested all zones.',
    '8|29|Resolved|Panel fully functional and tested; fire watch stood down.',
    '120|29|Closed|AMC response-time penalty clause invoked; closed.'] },
  { t: 'ERP database restore test failed', d: 'The first scheduled restore of the ERP database to the test server failed with a corrupted log chain.', sev: 'Medium', dept: 'IT', rep: 8, asg: 7, risk: 18, occ: '2026-03-05T08:50:00', lag: 2, steps: [
    '3|7|Investigating|Backup chain inspected; transaction log backups missing for six hours on 1 March.',
    '30|7|-|Backup job schedule found overwritten by a maintenance task.',
    '36|7|Resolved|Job schedule corrected and a full backup restored successfully on the test server.',
    '96|5|Closed|Closed; quarterly restore tests added to the IT calendar.'] },
  { t: 'Rebate claim keyed with wrong customer code', d: 'A ₹2.8 lakh rebate for a Pune distributor was posted against a Nashik customer code.', sev: 'Low', dept: 'SLS', rep: 28, asg: 25, risk: null, occ: '2026-03-18T15:35:00', lag: 20, steps: [
    '4|25|Investigating|Claim traced to a manual entry in the rebate workbook.',
    '26|28|Resolved|Entry reversed and reposted to the correct customer; both distributors informed.',
    '48|25|Closed|Both distributor ledgers reconciled by Sales Operations; closed.'] },
  { t: 'Operator laceration at press shop', d: 'An operator suffered a finger laceration while clearing a jam on an unguarded press; first aid given and a hospital visit followed.', sev: 'High', dept: 'OPS', rep: 10, asg: 9, risk: 28, occ: '2026-04-02T12:00:00', lag: 1, steps: [
    '2|9|Investigating|Machine locked out; EHS Officer started the injury investigation.',
    '36|9|Contained|Interim guarding fitted on the affected press; all press operators briefed on lock-out procedure.',
    '96|9|Resolved|Investigation report accepted: root cause was missing interlocked guard and unwritten jam-clearing method. Corrective actions assigned.'] },
  { t: 'Gearbox failure stops Line 2 for 52 hours', d: 'The Line 2 extrusion press gearbox seized mid-shift, stopping production for 52 hours and delaying 14 customer orders.', sev: 'Critical', dept: 'OPS', rep: 11, asg: 9, risk: 7, occ: '2026-04-20T06:15:00', lag: 0.5, steps: [
    '1|9|Investigating|Press isolated and gearbox opened; metal debris found in the oil.',
    '18|9|Contained|Customer orders re-sequenced to Lines 1 and 3; critical orders covered by overtime.',
    '34|11|-|Replacement gearbox received from the OEM and fitted.',
    '12|9|Resolved|Line 2 returned to service after commissioning run; fault attributed to the overdue overhaul.'] },
  { t: 'Counterfeit packs found in Nagpur retail', d: 'A field sales officer found counterfeit packs of a top-selling SKU in three Nagpur retail outlets.', sev: 'Medium', dept: 'SLS', rep: 27, asg: 26, risk: 17, occ: '2026-05-08T14:40:00', lag: 8, steps: [
    '6|26|Investigating|Samples bought and sent to the quality lab for comparison.',
    '72|26|-|Lab confirms the packs are counterfeit; print quality and fill weight differ.',
    '48|21|Resolved|Complaint filed with the cyber and economic offences cell; retailers were warned and stock was removed.'] },
  { t: 'Malware beaconing from contractor laptop', d: 'Network monitoring flagged outbound command-and-control beaconing from a contractor laptop connected to the Bhiwadi office network.', sev: 'High', dept: 'IT', rep: 6, asg: 5, risk: 21, occ: '2026-05-26T09:30:00', lag: 1, steps: [
    '1|5|Investigating|Device blocked at the switch port; contractor engineer asked to hand over the laptop.',
    '8|6|Contained|No lateral movement seen in logs; the laptop was reimaged.',
    '40|5|Resolved|Endpoint protection mandated for all contractor devices before network access.'] },
  { t: 'Inventory count variance at Bhiwandi 3PL', d: 'The June cycle count at the Bhiwandi third-party warehouse found a stock shortfall valued at ₹19.2 lakh.', sev: 'Medium', dept: 'FIN', rep: 4, asg: 1, risk: 22, occ: '2026-06-09T17:10:00', lag: 30, steps: [
    '8|1|Investigating|Recount scheduled with the 3PL; goods movement history requested.',
    '70|1|-|Recount reduced the shortfall to ₹11.7 lakh; unposted transfers explained the rest.',
    '96|1|Resolved|3PL accepted liability for the remaining shortfall; claim deducted from the next invoice.'] },
  { t: 'Payroll cut-off missed for 14 contract workers', d: 'Attendance for 14 contract workers at Bhiwadi was submitted after the payroll cut-off and left out of the June run.', sev: 'Low', dept: 'HR', rep: 18, asg: 17, risk: null, occ: '2026-06-23T10:20:00', lag: 3, steps: [
    '3|17|Investigating|Attendance sheets checked; contractor supervisor submitted them a day late.',
    '24|19|Resolved|Off-cycle payment made the same day; cut-off reminders now sent two days ahead.'] },
  { t: 'Monsoon waterlogging at Gurugram yard', d: 'Heavy rain flooded the Gurugram distribution yard to 30 cm; six trucks were delayed by up to 14 hours.', sev: 'High', dept: 'FAC', rep: 32, asg: 31, risk: 20, occ: '2026-07-07T03:55:00', lag: 2, steps: [
    '2|31|Investigating|Hired pumps deployed; loaded trucks moved to the higher bay.',
    '16|31|Contained|Water cleared by midday; no stock damage found.',
    '30|29|Resolved|Dispatch normalised. Permanent drain proposal forwarded to the capital committee.'] },
  { t: 'ERP database unavailable for four hours', d: 'A storage controller fault took the ERP database offline for four hours, stopping order entry and warehouse dispatch.', sev: 'Critical', dept: 'IT', rep: 8, asg: 7, risk: 18, occ: '2026-07-15T13:45:00', lag: 0.5, steps: [
    '0.5|7|Investigating|Failover to the secondary controller attempted; the standby did not take over cleanly.',
    '3.5|7|Contained|Service restored on a manual controller switch. Data integrity checks running.'] },
  { t: 'Export containers held at Mundra for documentation error', d: 'Three export containers were held at Mundra port after the forwarder filed the wrong HS code on the shipping bill.', sev: 'High', dept: 'SCM', rep: 15, asg: 13, risk: 31, occ: '2026-07-29T11:05:00', lag: 4, steps: [
    '3|13|Investigating|Forwarder asked to file an amendment; customs query being tracked daily.',
    '52|13|Contained|Amendment approved; containers cleared with a demurrage cost of ₹1.9 lakh.'] },
  { t: 'Channel partner onboarded without anti-bribery declaration', d: 'A Lucknow channel partner received supplies for two months without a signed anti-bribery declaration on file.', sev: 'Medium', dept: 'LGL', rep: 24, asg: 21, risk: 33, occ: '2026-08-06T09:15:00', lag: 48, steps: [
    '5|21|Investigating|Onboarding checklist reviewed; the declaration step was marked complete in error.',
    '30|21|Contained|Partner has signed the declaration; supplies continue under watch while due diligence is completed.'] },
  { t: 'Cracked Line 1 mould forces borrowed tooling', d: 'A mould cavity cracked on Line 1; a backup tool was borrowed from the Bhiwadi Phase I stores at reduced cycle speed.', sev: 'High', dept: 'OPS', rep: 10, asg: 9, risk: 37, occ: '2026-08-14T16:30:00', lag: 1, steps: [
    '2|9|Investigating|Mould sent to the toolroom for weld repair assessment.',
    '40|10|Contained|Backup tool running at 80% of normal cycle speed; backlog tracked daily.'] },
  { t: 'Two CNC operators resign in the same week', d: 'Two senior CNC operators resigned on consecutive days to join a competitor, leaving the night shift short.', sev: 'Medium', dept: 'HR', rep: 20, asg: 17, risk: 12, occ: '2026-08-24T08:20:00', lag: 6, steps: [
    '4|17|Investigating|Exit interviews scheduled; both cite pay and shift pattern.',
    '60|17|Contained|Two trainee operators moved to the night shift under supervision; counter-offers declined.'] },
  { t: 'Payment released without second approver', d: 'ERP flagged a ₹18.6 lakh vendor payment released by a single user holding both create and release roles.', sev: 'High', dept: 'FIN', rep: 4, asg: 2, risk: 2, occ: '2026-09-01T12:40:00', lag: 3, steps: [
    '2|2|Investigating|Payment recalled with the bank pending verification of invoice and vendor.',
    '26|2|-|Invoice and goods receipt are valid; user confirms the bypass was to meet a due date.',
    '20|3|-|Internal audit added the case to the segregation-of-duties exception log.'] },
  { t: 'Cold-room compressor trip at Jaipur DC', d: 'The cold-room compressor tripped at Jaipur DC and the temperature reached 11°C for three hours before the standby unit was started by hand.', sev: 'Medium', dept: 'SCM', rep: 16, asg: 15, risk: 5, occ: '2026-09-05T10:10:00', lag: 3, steps: [
    '2|15|Investigating|Standby unit started manually; temperature loggers downloaded for the quality team.',
    '28|16|-|Standby auto-changeover relay found faulty; replacement requested from the vendor.'] },
  { t: 'OAuth consent phishing against Treasury executive', d: 'A Treasury executive granted a malicious application access to mail and files after a convincing consent-request email.', sev: 'Critical', dept: 'IT', rep: 6, asg: 5, risk: 4, occ: '2026-09-11T15:00:00', lag: 5, steps: [
    '1|5|Investigating|Application consent revoked and tokens invalidated; sign-in logs under review.',
    '10|6|-|Application read 212 emails and a shared forecast file before revocation.',
    '36|5|-|Finance leadership told which files were exposed; conditional access policy drafted.'] },
  { t: 'Eyewash station inoperative in chemical store', d: 'The emergency eyewash station in the chemical store at Bhiwadi was found with no water supply during a routine check.', sev: 'Medium', dept: 'FAC', rep: 30, asg: 30, risk: null, occ: '2026-09-16T09:50:00', lag: 1, steps: [
    '2|30|Investigating|Portable eyewash bottles placed; plumbing contractor called.',
    '30|31|-|Isolation valve found closed after the August shutdown.',
    '170|31|Resolved|Valve reopened and the station flow-tested; a weekly eyewash check is now on the EHS round sheet.'] },
  { t: 'Customer data export sent to wrong vendor address', d: 'A customer contact export was emailed to an outdated address at an external analytics vendor.', sev: 'High', dept: 'LGL', rep: 23, asg: 22, risk: 15, occ: '2026-09-22T14:25:00', lag: 20, steps: [
    '3|22|Investigating|Vendor asked to confirm deletion; email gateway logs pulled.',
    '48|23|-|Vendor certified deletion in writing; assessment of notification duty under the DPDP Act in progress.'] },
  { t: 'Rebate accrual discrepancy in West region', d: 'The West region rebate accrual is ₹4.2 lakh lower than the sum of signed rebate letters.', sev: 'Low', dept: 'SLS', rep: 28, asg: 25, risk: 26, occ: '2026-09-28T11:15:00', lag: 24, steps: [
    '6|25|Investigating|Letters being matched line by line with the accrual workbook.',
    '60|25|Resolved|Missing letter for one distributor found; accrual topped up by ₹4.2 lakh in the October close.'] },
  { t: 'Preventive maintenance skipped on Line 4', d: 'The monthly preventive maintenance on Line 4 was skipped because the maintenance supervisor was on leave with no named delegate.', sev: 'Medium', dept: 'OPS', rep: 11, asg: null, risk: 9, occ: '2026-10-02T07:30:00', lag: 30, steps: [
    '4|11|Investigating|Work order rescheduled for the coming weekend; no owner has been assigned yet.'] },
  { t: 'Resin supplier delays shipment by nine days', d: 'The resin supplier reported a nine-day delay after vessel rollover; Line 3 buffer stands at 12 days.', sev: 'High', dept: 'SCM', rep: 14, asg: 13, risk: 1, occ: '2026-10-06T18:00:00', lag: 4, steps: [
    '5|13|Investigating|Trial lot from the alternate supplier fast-tracked; air freight quote requested.',
    '40|14|-|Alternate supplier will deliver 6 MT in five days, enough to bridge the gap.'] },
  { t: 'Visitor Wi-Fi bridged to corporate VLAN', d: 'A vulnerability scan showed the visitor Wi-Fi at the Gurugram office can reach corporate servers.', sev: 'Medium', dept: 'IT', rep: 32, asg: null, risk: null, occ: '2026-10-09T10:45:00', lag: 48, steps: [] },
  { t: 'Repeated false alarms from Neemrana smoke detectors', d: 'Zone C smoke detectors at Neemrana triggered four false alarms in a week, and staff have begun to ignore evacuation calls.', sev: 'High', dept: 'FAC', rep: 31, asg: null, risk: 16, occ: '2026-10-12T13:20:00', lag: 6, steps: [
    '20|31|-|Dust accumulation suspected; vendor visit requested.'] },
  { t: 'Biometric attendance sync failures at Bhiwadi', d: 'The biometric devices at Bhiwadi have failed to sync to HR software on five days, causing manual attendance corrections.', sev: 'Low', dept: 'HR', rep: 18, asg: 19, risk: null, occ: '2026-10-15T09:10:00', lag: 5, steps: [] },
  { t: 'Unhedged USD exposure above policy limit', d: 'Treasury identified an unhedged USD payable position of USD 410,000, above the 25% policy limit.', sev: 'Medium', dept: 'FIN', rep: 1, asg: 2, risk: 36, occ: '2026-10-17T16:05:00', lag: 2, steps: [
    '3|2|-|Position reviewed; two forward contracts quoted for the shortfall.'] },
  { t: 'Broken seals on inbound shipment at Jaipur DC', d: 'Seals were broken on a consignment of finished-good cartons from a contract manufacturer when it arrived at Jaipur DC.', sev: 'High', dept: 'SCM', rep: 16, asg: 13, risk: null, occ: '2026-10-19T08:40:00', lag: 2, steps: [] },
];

const incidents: Incident[] = [];
const incident_updates: IncidentUpdate[] = [];
const pushUpdate = (incident_id: number, by: number, text: string, from: IncidentStatus | null, to: IncidentStatus | null, at: string) =>
  incident_updates.push({ update_id: incident_updates.length + 1, incident_id, updated_by: by, update_text: text, status_from: from, status_to: to, created_at: at });

I.forEach((s, i) => {
  const incident_id = i + 1;
  const reported_at = addHours(s.occ, s.lag);
  let status: IncidentStatus = 'Open';
  let resolved_at: string | null = null;
  pushUpdate(incident_id, s.rep, 'Incident reported', null, 'Open', reported_at);
  let t = reported_at;
  if (s.asg) {
    t = addHours(t, 1);
    pushUpdate(incident_id, 2, `Assigned to ${empName(s.asg)}`, null, null, t);
  }
  for (const step of s.steps) {
    const [h, by, st, ...rest] = step.split('|');
    t = addHours(t, Number(h));
    const to = st === '-' ? null : (st as IncidentStatus);
    pushUpdate(incident_id, Number(by), rest.join('|'), to ? status : null, to, t);
    if (to) {
      status = to;
      resolved_at = to === 'Resolved' ? t : to === 'Investigating' ? null : resolved_at;
    }
  }
  incidents.push({
    incident_id, incident_code: `INC-${pad(incident_id)}`, title: s.t, description: s.d, severity: s.sev,
    status, department_id: deptId(s.dept), reported_by: s.rep, assigned_to: s.asg, risk_id: s.risk,
    occurred_at: s.occ, reported_at, resolved_at,
  });
});

export const seed: Dataset = { departments, employees, risks, risk_assessments, incidents, incident_updates };
