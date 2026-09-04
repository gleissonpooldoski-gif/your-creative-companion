/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/states";
import { PageHeader } from "@/components/app/primitives";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "datetime";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  helper?: string;
};

export type ColumnDef = {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
};

export function ResourcePage({
  table,
  title,
  breadcrumb,
  description,
  columns,
  fields,
  createLabel = "Adicionar",
  emptyTitle,
  emptyDescription,
  searchColumn,
  extraActions,
  above,
  below,
  rowActions,
  orderBy,
}: {
  table: string;
  title: string;
  breadcrumb?: string;
  description?: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  createLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
  searchColumn?: string;
  extraActions?: ReactNode;
  above?: ReactNode;
  below?: ReactNode;
  rowActions?: (row: any) => ReactNode;
  orderBy?: string;
}) {
  const [term, setTerm] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const list = useServerFn(listResourceFn);
  const create = useServerFn(createResourceFn);
  const remove = useServerFn(deleteResourceFn);

  const queryKey = ["resource", table, term, orderBy ?? "created_at"];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      list({
        data: {
          table,
          limit: 50,
          ...(orderBy ? { orderBy } : {}),
          ...(searchColumn && term ? { search: { column: searchColumn, value: term } } : {}),
        },
      }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = form[field.name];
        if (raw === undefined || raw === "") {
          if (field.required) throw new Error(`Preencha o campo "${field.label}".`);
          continue;
        }
        values[field.name] = field.type === "number" ? Number(raw) : raw;
      }
      return create({ data: { table, values } });
    },
    onSuccess: async () => {
      toast.success("Registro criado.");
      setForm({});
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["resource", table] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { table, id } }),
    onSuccess: async () => {
      toast.success("Registro excluído.");
      await queryClient.invalidateQueries({ queryKey: ["resource", table] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        {...(breadcrumb ? { breadcrumb } : {})}
        title={title}
        {...(description ? { description } : {})}
        actions={
          <>
            {extraActions}
            {fields.length > 0 ? (
              <Button size="sm" onClick={() => setShowForm((value) => !value)}>
                {showForm ? "Fechar" : createLabel}
              </Button>
            ) : null}
          </>
        }
      />

      {above}

      {showForm && fields.length > 0 ? (
        <form
          className="panel grid gap-4 p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={`${table}-${field.name}`}>{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`${table}-${field.name}`}
                  value={form[field.name] ?? ""}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                />
              ) : field.type === "select" ? (
                <Select
                  value={form[field.name] ?? ""}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, [field.name]: value }))}
                >
                  <SelectTrigger id={`${table}-${field.name}`}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options ?? []).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${table}-${field.name}`}
                  type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
                  value={form[field.name] ?? ""}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                />
              )}
              {field.helper ? <p className="text-xs text-muted-foreground">{field.helper}</p> : null}
            </div>
          ))}
          <div className="md:col-span-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      ) : null}

      {searchColumn ? (
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Filtrar..."
          className="max-w-sm"
        />
      ) : null}

      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={
            fields.length > 0 ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                {createLabel}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.rows.map((row: any) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.render ? column.render(row) : (row[column.key] ?? "—")}
                    </TableCell>
                  ))}
                  <TableCell className="space-x-2 text-right">
                    {rowActions?.(row)}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(row.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {query.data?.count ?? 0} registro(s) — exibindo até 50 por página.
          </p>
        </div>
      )}

      {below}
    </div>
  );
}

// Imported at the bottom to keep the component readable.
import { createResource as createResourceFn, deleteResource as deleteResourceFn, listResource as listResourceFn } from "@/lib/data.functions";
