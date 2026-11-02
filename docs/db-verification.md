# Database verification

Run on MySQL **8.0.46** at 2026-11-02 20:43:50 (UTC), against a throwaway database built from the migrations in `apps/api/database/migrations` and the sample seed.

**Result: 52 of 52 checks passed.**

Each "rejected" check is a statement that must fail; the MySQL error text shown is what the server actually returned.

## Tenancy: allowed

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | a second organisation can be created | accepted |
| PASS | the same department code can exist in two organisations | accepted |
| PASS | the same employee code and email can exist in two organisations | accepted |
| PASS | the same risk code can exist in two organisations | accepted |
| PASS | an incident may have no assignee and no linked risk | accepted |

## Tenancy: rejected

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | duplicate organisation slug | ERROR 1062 (23000) at line 1: Duplicate entry 'verify-co' for key 'organisation.uq_organisation_slug' |
| PASS | slug that is not url-safe | ERROR 3819 (HY000) at line 1: Check constraint 'ck_organisation_slug' is violated. |
| PASS | duplicate department code inside one organisation | ERROR 1062 (23000) at line 1: Duplicate entry '2-FIN' for key 'department.uq_department_org_code' |
| PASS | duplicate employee email inside one organisation | ERROR 1062 (23000) at line 1: Duplicate entry '2-rajesh.khanna@aravalli-industries.example' for key 'employee.uq_employee_org_email' |
| PASS | duplicate risk code inside one organisation | ERROR 1062 (23000) at line 1: Duplicate entry '2-RSK-0001' for key 'risk.uq_risk_org_code' |
| PASS | employee in organisation 2 pointing at a department of organisation 1 | ERROR 1452 (23000) at line 1: Cannot add or update a child row: a foreign key constraint fails (`aravalli_dev_verify`.`employee`, CONSTRAINT `fk_employee_department` FOREIGN KEY (`department_id`, `organisation_id`) REFERENCES `department` (`department_id`, `organisation_id`) ON DELETE RE) |
| PASS | risk in organisation 1 owned by an employee of organisation 2 | ERROR 1452 (23000) at line 1: Cannot add or update a child row: a foreign key constraint fails (`aravalli_dev_verify`.`risk`, CONSTRAINT `fk_risk_owner` FOREIGN KEY (`owner_employee_id`, `organisation_id`) REFERENCES `employee` (`employee_id`, `organisation_id`) ON DELETE RESTRICT ON UPD) |
| PASS | assessment by an assessor from another organisation | ERROR 1452 (23000) at line 1: Cannot add or update a child row: a foreign key constraint fails (`aravalli_dev_verify`.`risk_assessment`, CONSTRAINT `fk_assessment_assessor` FOREIGN KEY (`assessed_by`, `organisation_id`) REFERENCES `employee` (`employee_id`, `organisation_id`) ON DELETE R) |
| PASS | incident assigned to an employee of another organisation | ERROR 1452 (23000) at line 1: Cannot add or update a child row: a foreign key constraint fails (`aravalli_dev_verify`.`incident`, CONSTRAINT `fk_incident_assignee` FOREIGN KEY (`assigned_to`, `organisation_id`) REFERENCES `employee` (`employee_id`, `organisation_id`) ON DELETE RESTRICT O) |
| PASS | incident linked to a risk of another organisation | ERROR 1452 (23000) at line 1: Cannot add or update a child row: a foreign key constraint fails (`aravalli_dev_verify`.`incident`, CONSTRAINT `fk_incident_risk` FOREIGN KEY (`risk_id`, `organisation_id`) REFERENCES `risk` (`risk_id`, `organisation_id`) ON DELETE RESTRICT ON UPDATE RESTRIC) |
| PASS | incident update by an author from another organisation | ERROR 1452 (23000) at line 1: Cannot add or update a child row: a foreign key constraint fails (`aravalli_dev_verify`.`incident_update`, CONSTRAINT `fk_update_author` FOREIGN KEY (`updated_by`, `organisation_id`) REFERENCES `employee` (`employee_id`, `organisation_id`) ON DELETE RESTRICT) |

## Constraints: rejected

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | role that is not in the list (the old name Administrator) | ERROR 3819 (HY000) at line 1: Check constraint 'ck_employee_role' is violated. |
| PASS | risk category that is not in the list | ERROR 3819 (HY000) at line 1: Check constraint 'ck_risk_category' is violated. |
| PASS | risk status that is not in the list | ERROR 3819 (HY000) at line 1: Check constraint 'ck_risk_status' is violated. |
| PASS | risk title shorter than 5 characters | ERROR 3819 (HY000) at line 1: Check constraint 'ck_risk_title_len' is violated. |

## Constraints: allowed

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | a valid assessment is accepted | accepted |

## Constraints: rejected

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | likelihood of 6 | ERROR 3819 (HY000) at line 1: Check constraint 'ck_assessment_likelihood' is violated. |
| PASS | impact of 0 | ERROR 3819 (HY000) at line 1: Check constraint 'ck_assessment_impact' is violated. |
| PASS | writing risk_score directly (it is a generated column) | ERROR 3105 (HY000) at line 1: The value specified for generated column 'risk_score' in table 'risk_assessment' is not allowed. |
| PASS | incident severity that is not in the list | ERROR 3819 (HY000) at line 1: Check constraint 'ck_incident_severity' is violated. |
| PASS | incident reported before it occurred | ERROR 3819 (HY000) at line 1: Check constraint 'ck_incident_reported_after_occurred' is violated. |
| PASS | incident resolved before it occurred | ERROR 3819 (HY000) at line 1: Check constraint 'ck_incident_resolved_after_occurred' is violated. |
| PASS | a Resolved incident with no resolution time | ERROR 3819 (HY000) at line 1: Check constraint 'ck_incident_resolved_matches_status' is violated. |
| PASS | an Open incident that already has a resolution time | ERROR 3819 (HY000) at line 1: Check constraint 'ck_incident_resolved_matches_status' is violated. |

## Constraints: allowed

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | a valid incident update is accepted | accepted |

## Constraints: rejected

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | an update to a status that is not in the list | ERROR 3819 (HY000) at line 1: Check constraint 'ck_update_status_to' is violated. |

## Triggers: rejected

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | updating a risk assessment (history is append-only) | ERROR 1644 (45000) at line 1: risk_assessment history is append-only |
| PASS | deleting a risk assessment | ERROR 1644 (45000) at line 1: risk_assessment history is append-only |
| PASS | updating an incident update | ERROR 1644 (45000) at line 1: incident_update is append-only |
| PASS | deleting an incident update | ERROR 1644 (45000) at line 1: incident_update is append-only |

## Delete protection: rejected

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | deleting an employee who owns risks | ERROR 1451 (23000) at line 1: Cannot delete or update a parent row: a foreign key constraint fails (`aravalli_dev_verify`.`risk_assessment`, CONSTRAINT `fk_assessment_assessor` FOREIGN KEY (`assessed_by`, `organisation_id`) REFERENCES `employee` (`employee_id`, `organisation_id`) ON DELETE R) |
| PASS | deleting a department that has employees | ERROR 1451 (23000) at line 1: Cannot delete or update a parent row: a foreign key constraint fails (`aravalli_dev_verify`.`employee`, CONSTRAINT `fk_employee_department` FOREIGN KEY (`department_id`, `organisation_id`) REFERENCES `department` (`department_id`, `organisation_id`) ON DELETE RE) |
| PASS | deleting a risk that has assessments | ERROR 1451 (23000) at line 1: Cannot delete or update a parent row: a foreign key constraint fails (`aravalli_dev_verify`.`risk_assessment`, CONSTRAINT `fk_assessment_risk` FOREIGN KEY (`risk_id`, `organisation_id`) REFERENCES `risk` (`risk_id`, `organisation_id`) ON DELETE RESTRICT ON UPDAT) |
| PASS | deleting an incident that has updates | ERROR 1451 (23000) at line 1: Cannot delete or update a parent row: a foreign key constraint fails (`aravalli_dev_verify`.`incident_update`, CONSTRAINT `fk_update_incident` FOREIGN KEY (`incident_id`, `organisation_id`) REFERENCES `incident` (`incident_id`, `organisation_id`) ON DELETE RESTR) |
| PASS | deleting an organisation that has data | ERROR 1451 (23000) at line 1: Cannot delete or update a parent row: a foreign key constraint fails (`aravalli_dev_verify`.`department`, CONSTRAINT `fk_department_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisation` (`organisation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT) |

## Views and values

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | risk_score is generated as likelihood x impact | returned "20", expected "20" |
| PASS | v_risk_current: every risk of the sample organisation is listed | returned "40", expected "40" |
| PASS | v_risk_current: RSK-0002 shows its latest score and band | returned "20 Critical", expected "20 Critical" |
| PASS | v_risk_current: never-assessed risks are Unrated | returned "3", expected "3" |
| PASS | v_risk_current uses the latest assessment, not the first (RSK-0001 has several) | returned "9", expected "9" |
| PASS | v_incident_summary: every incident of the sample organisation is listed | returned "36", expected "36" |
| PASS | v_incident_summary: open incidents with nobody assigned match the seed | returned "3", expected "3" |
| PASS | views are tenant-scoped: organisation 2 sees only its own 1 risk | returned "1", expected "1" |
| PASS | views are tenant-scoped: organisation 2 sees only its own 1 incident | returned "1", expected "1" |
| PASS | seed has the expected rows (risks, assessments, incidents, updates) | returned "40/103/36/162", expected "40/103/36/162" |

## Constraints: allowed

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | a risk can be owned by someone from another department (a Risk Officer can own risks across departments) | accepted |

## Reporting queries

| Result | Check | What MySQL said |
| --- | --- | --- |
| PASS | every query in queries.sql runs without error | accepted |
