-- Qualify PL/pgSQL parameters so they cannot collide with table column names.
CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  actor_id uuid,
  action_key text,
  max_attempts integer,
  window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p_actor_id ALIAS FOR $1;
  p_action_key ALIAS FOR $2;
  p_max_attempts ALIAS FOR $3;
  p_window_seconds ALIAS FOR $4;
  current_count integer;
BEGIN
  IF p_actor_id IS NULL
    OR p_max_attempts < 1
    OR p_window_seconds < 1
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.api_rate_limits AS rate_limit (
    actor_id, action_key, window_started_at, attempt_count
  ) VALUES (
    p_actor_id,
    p_action_key,
    now(),
    1
  )
  ON CONFLICT ON CONSTRAINT api_rate_limits_pkey DO UPDATE
  SET window_started_at = CASE
        WHEN rate_limit.window_started_at <= now() - make_interval(
          secs => p_window_seconds
        )
          THEN now()
        ELSE rate_limit.window_started_at
      END,
      attempt_count = CASE
        WHEN rate_limit.window_started_at <= now() - make_interval(
          secs => p_window_seconds
        )
          THEN 1
        ELSE rate_limit.attempt_count + 1
      END
  RETURNING rate_limit.attempt_count INTO current_count;

  RETURN current_count <= p_max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(uuid, text, integer, integer) TO service_role;
