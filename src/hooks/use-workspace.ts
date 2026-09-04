import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getWorkspaceContext } from "@/lib/data.functions";

export function useWorkspace() {
  const fetchContext = useServerFn(getWorkspaceContext);
  return useQuery({
    queryKey: ["workspace-context"],
    queryFn: () => fetchContext(),
    staleTime: 30_000,
  });
}
