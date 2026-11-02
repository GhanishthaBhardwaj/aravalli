-- 0006_triggers
-- Rules a CHECK constraint cannot express. DELIMITER is handled by the mysql client the runner uses.

DELIMITER $$

-- History is append-only: an assessment or an incident update, once written, cannot change or go away.
CREATE TRIGGER trg_risk_assessment_no_update BEFORE UPDATE ON risk_assessment
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'risk_assessment history is append-only';
END$$

CREATE TRIGGER trg_risk_assessment_no_delete BEFORE DELETE ON risk_assessment
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'risk_assessment history is append-only';
END$$

CREATE TRIGGER trg_incident_update_no_update BEFORE UPDATE ON incident_update
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'incident_update is append-only';
END$$

CREATE TRIGGER trg_incident_update_no_delete BEFORE DELETE ON incident_update
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'incident_update is append-only';
END$$

-- A risk's owner must work in the risk's department.
CREATE TRIGGER trg_risk_owner_in_department_insert BEFORE INSERT ON risk
FOR EACH ROW BEGIN
  DECLARE owner_department INT UNSIGNED;
  SELECT department_id INTO owner_department
    FROM employee
   WHERE employee_id = NEW.owner_employee_id AND organisation_id = NEW.organisation_id;
  IF owner_department IS NULL OR owner_department <> NEW.department_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'risk owner must belong to the risk department';
  END IF;
END$$

CREATE TRIGGER trg_risk_owner_in_department_update BEFORE UPDATE ON risk
FOR EACH ROW BEGIN
  DECLARE owner_department INT UNSIGNED;
  SELECT department_id INTO owner_department
    FROM employee
   WHERE employee_id = NEW.owner_employee_id AND organisation_id = NEW.organisation_id;
  IF owner_department IS NULL OR owner_department <> NEW.department_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'risk owner must belong to the risk department';
  END IF;
END$$

DELIMITER ;
