-- 0006_triggers
-- Rules a CHECK constraint cannot express. DELIMITER is handled by the mysql client the runner uses.
--
-- History is append-only: an assessment or an incident update, once written, cannot change or go away.
-- (A risk's owner is deliberately NOT tied to the risk's department: a Risk Officer can own risks across departments.)

DELIMITER $$

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

DELIMITER ;
