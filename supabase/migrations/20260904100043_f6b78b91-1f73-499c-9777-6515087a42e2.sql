CREATE POLICY "deny direct access to discovery provider credentials"
ON public.group_discovery_provider_configs
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "deny direct access to telegram credentials"
ON public.telegram_credentials
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);