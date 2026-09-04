/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge } from "@/components/app/primitives";
import { createResource } from "@/lib/data.functions";
import { expandKeywords } from "@/lib/ai.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/groups/mining")({
  head: () => pageHead("Mineração de Grupos", "Descubra grupos por palavras-chave expandidas com IA e registre fontes."),
  component: MiningPage,
});

function MiningPage() {
  const [seed, setSeed] = useState("");
  const expand = useServerFn(expandKeywords);
  const create = useServerFn(createResource);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const result: any = await expand({ data: { seed, count: 10 } });
      const keywords: string[] = result.keywords ?? [];
      for (const keyword of keywords) {
        await create({ data: { table: "group_keywords", values: { keyword } } });
      }
      return keywords.length;
    },
    onSuccess: async (count) => {
      toast.success(`${count} palavra(s)-chave adicionadas pela IA.`);
      setSeed("");
      await queryClient.invalidateQueries({ queryKey: ["resource", "group_keywords"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ResourcePage
      table="group_keywords"
      breadcrumb="Grupos"
      title="Mineração de Grupos"
      description="Palavras-chave alimentam a busca de grupos públicos. Cada grupo encontrado entra em Grupos Entrados após adesão real."
      searchColumn="keyword"
      createLabel="Nova palavra-chave"
      emptyTitle="Nenhuma palavra-chave"
      emptyDescription="Adicione palavras-chave manualmente ou expanda uma semente com IA."
      above={
        <div className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="seed" className="text-sm font-medium">
              Expandir com IA
            </label>
            <Input
              id="seed"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="ex.: marketing digital"
            />
          </div>
          <Button disabled={mutation.isPending || seed.trim().length < 3} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Expandindo..." : "Expandir"}
          </Button>
        </div>
      }
      fields={[{ name: "keyword", label: "Palavra-chave", required: true }]}
      columns={[
        { key: "keyword", label: "Palavra-chave" },
        { key: "category", label: "Categoria" },
      ]}
    />
  );
}
