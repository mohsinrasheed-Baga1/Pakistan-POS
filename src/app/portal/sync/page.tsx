"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function BulkSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<any>(null);

  async function handleBulkSync() {
    setSyncing(true);
    setResults(null);
    try {
      const res = await fetch("/api/bulk-sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setResults(data.results);
        toast.success(`Sync complete!`);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-emerald-700">Bulk Sync to Online Portal</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Sync all existing products, cards, and sales to the online portal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleBulkSync} disabled={syncing}>
            {syncing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing…</> : <><Upload className="w-4 h-4 mr-2" /> Sync All Data</>}
          </Button>
          {results && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 className="w-4 h-4" /> Sync Complete!</div>
              <div className="text-sm space-y-1">
                <div>Products: <strong>{results.products}</strong></div>
                <div>Cards: <strong>{results.cards}</strong></div>
                <div>Sales: <strong>{results.sales}</strong></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
