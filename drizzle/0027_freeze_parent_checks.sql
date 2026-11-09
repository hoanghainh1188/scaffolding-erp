-- Hand-written (post-merge review of production-orders, item 2): an UPDATE
-- that moves a line or a material to another order must respect the freeze
-- of both the order it leaves and the order it joins. OLD is empty on INSERT
-- and NEW on DELETE, so `IN (OLD.x, NEW.x)` holds the only parent there.
CREATE OR REPLACE FUNCTION "production_order_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_statuses text[];
BEGIN
  IF TG_TABLE_NAME = 'production_order' THEN
    parent_statuses := ARRAY[OLD.status];
  ELSIF TG_TABLE_NAME = 'production_order_material' THEN
    SELECT array_agg(o.status) INTO parent_statuses
      FROM "production_order_line" l
      JOIN "production_order" o ON o.id = l.order_id
      WHERE l.id IN (OLD.line_id, NEW.line_id);
  ELSE
    SELECT array_agg(status) INTO parent_statuses FROM "production_order"
      WHERE id IN (OLD.order_id, NEW.order_id);
  END IF;
  IF 'POSTED' = ANY(parent_statuses) THEN
    RAISE EXCEPTION 'Lệnh đã ghi sổ, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF 'CANCELLED' = ANY(parent_statuses) THEN
    RAISE EXCEPTION 'Lệnh đã hủy, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "repair_order_posted_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_statuses text[];
BEGIN
  IF TG_TABLE_NAME = 'repair_order' THEN
    parent_statuses := ARRAY[OLD.status];
  ELSIF TG_TABLE_NAME = 'repair_order_material' THEN
    SELECT array_agg(o.status) INTO parent_statuses
      FROM "repair_order_line" l
      JOIN "repair_order" o ON o.id = l.order_id
      WHERE l.id IN (OLD.line_id, NEW.line_id);
  ELSE
    SELECT array_agg(status) INTO parent_statuses FROM "repair_order"
      WHERE id IN (OLD.order_id, NEW.order_id);
  END IF;
  IF 'POSTED' = ANY(parent_statuses) THEN
    RAISE EXCEPTION 'Phiếu đã ghi sổ, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF 'CANCELLED' = ANY(parent_statuses) THEN
    RAISE EXCEPTION 'Lệnh đã hủy, không sửa hay xóa được'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
