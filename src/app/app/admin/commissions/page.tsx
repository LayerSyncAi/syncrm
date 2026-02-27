"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RightDrawer } from "@/components/common/right-drawer";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  XCircle,
  DollarSign,
  Users,
  Building2,
  CheckCircle,
  Clock,
} from "lucide-react";
import { commissionToasts } from "@/lib/toast";

type Scenario = "shared_deal" | "own_property_own_lead" | "company_property";
type CommissionStatus = "pending" | "approved" | "paid";

const scenarioLabels: Record<Scenario, string> = {
  shared_deal: "Shared Deal",
  own_property_own_lead: "Own Property & Own Lead",
  company_property: "Company Property",
};

const scenarioDescriptions: Record<Scenario, string> = {
  shared_deal: "Property shared between two agents. Agent A holds the property, Agent B closes the deal with their lead.",
  own_property_own_lead: "Agent closes a deal using their own property listing and their own lead.",
  company_property: "Agent brings a lead to a company-listed property (no specific property agent).",
};

const scenarioIcons: Record<Scenario, typeof Users> = {
  shared_deal: Users,
  own_property_own_lead: Building2,
  company_property: DollarSign,
};

interface ConfigFormData {
  name: string;
  description: string;
  scenario: Scenario;
  propertyAgentPercent: string;
  leadAgentPercent: string;
  companyPercent: string;
  isDefault: boolean;
}

const defaultFormData: ConfigFormData = {
  name: "",
  description: "",
  scenario: "shared_deal",
  propertyAgentPercent: "40",
  leadAgentPercent: "40",
  companyPercent: "20",
  isDefault: true,
};

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

type ActiveTab = "configs" | "commissions";

export default function CommissionsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Queries
  const configs = useQuery(api.commissions.listConfigs);
  const dealCommissions = useQuery(api.commissions.listDealCommissions, {});

  // Mutations
  const createConfig = useMutation(api.commissions.createConfig);
  const updateConfig = useMutation(api.commissions.updateConfig);
  const deleteConfig = useMutation(api.commissions.deleteConfig);
  const updateCommissionStatus = useMutation(api.commissions.updateCommissionStatus);
  const seedDefaults = useMutation(api.commissions.seedDefaultConfigs);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>("configs");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Id<"commissionConfigs"> | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<Id<"commissionConfigs"> | null>(null);
  const [formData, setFormData] = useState<ConfigFormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Seed defaults on first load
  useEffect(() => {
    if (configs !== undefined && configs.length === 0) {
      seedDefaults();
    }
  }, [configs, seedDefaults]);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Admins only.</p>
      </div>
    );
  }

  // Config form handlers
  const openCreateDrawer = () => {
    setEditingConfig(null);
    setFormData(defaultFormData);
    setError(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (configId: Id<"commissionConfigs">) => {
    const config = configs?.find((c) => c._id === configId);
    if (config) {
      setEditingConfig(configId);
      setFormData({
        name: config.name,
        description: config.description || "",
        scenario: config.scenario,
        propertyAgentPercent: config.propertyAgentPercent.toString(),
        leadAgentPercent: config.leadAgentPercent.toString(),
        companyPercent: config.companyPercent.toString(),
        isDefault: config.isDefault,
      });
      setError(null);
      setDrawerOpen(true);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingConfig(null);
    setFormData(defaultFormData);
    setError(null);
  };

  const handlePercentChange = (field: "propertyAgentPercent" | "leadAgentPercent" | "companyPercent", value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Config name is required");
      return;
    }

    const propPercent = parseFloat(formData.propertyAgentPercent) || 0;
    const leadPercent = parseFloat(formData.leadAgentPercent) || 0;
    const compPercent = parseFloat(formData.companyPercent) || 0;
    const total = propPercent + leadPercent + compPercent;

    if (Math.abs(total - 100) > 0.01) {
      setError(`Percentages must sum to 100%. Current total: ${total}%`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingConfig) {
        await updateConfig({
          configId: editingConfig,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          propertyAgentPercent: propPercent,
          leadAgentPercent: leadPercent,
          companyPercent: compPercent,
          isDefault: formData.isDefault,
        });
        commissionToasts.configUpdated(formData.name.trim());
      } else {
        await createConfig({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          scenario: formData.scenario,
          propertyAgentPercent: propPercent,
          leadAgentPercent: leadPercent,
          companyPercent: compPercent,
          isDefault: formData.isDefault,
        });
        commissionToasts.configCreated(formData.name.trim());
      }
      closeDrawer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save config";
      setError(msg);
      commissionToasts.configSaveFailed(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!configToDelete) return;
    setIsSubmitting(true);

    const configName = configs?.find((c) => c._id === configToDelete)?.name || "Config";
    try {
      await deleteConfig({ configId: configToDelete });
      commissionToasts.configDeleted(configName);
      setDeleteConfirmOpen(false);
      setConfigToDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete config";
      setError(msg);
      commissionToasts.configDeleteFailed(msg);
      setDeleteConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (commissionId: Id<"dealCommissions">, newStatus: CommissionStatus) => {
    try {
      await updateCommissionStatus({ commissionId, status: newStatus });
      commissionToasts.statusUpdated(newStatus);
    } catch (err) {
      commissionToasts.statusUpdateFailed(err instanceof Error ? err.message : undefined);
    }
  };

  const percentTotal = (parseFloat(formData.propertyAgentPercent) || 0) +
    (parseFloat(formData.leadAgentPercent) || 0) +
    (parseFloat(formData.companyPercent) || 0);

  const configToDeleteName = configs?.find((c) => c._id === configToDelete)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Commissions</h2>
          <p className="text-sm text-text-muted">
            Configure commission split scenarios and track deal commissions.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border">
        <div className="flex gap-6 relative">
          {(["configs", "commissions"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
                activeTab === tab ? "text-text" : "text-text-muted hover:text-text"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "configs" ? "Split Scenarios" : "Deal Commissions"}
              {activeTab === tab && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  layoutId="commission-tab-indicator"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === "configs" && (
          <motion.div
            key="configs"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex justify-end">
              <button
                onClick={openCreateDrawer}
                className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
              >
                <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
                  <Plus className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary" />
                </span>
                <span className="text-sm font-medium">Add scenario</span>
              </button>
            </div>

            {configs === undefined ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
                <p className="text-sm text-text-muted mb-4">No commission scenarios configured</p>
                <Button onClick={openCreateDrawer}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add your first scenario
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {configs.map((config) => {
                  const Icon = scenarioIcons[config.scenario] || DollarSign;
                  return (
                    <motion.div
                      key={config._id}
                      variants={rowVariants}
                      initial="hidden"
                      animate="show"
                      className="rounded-lg border border-border bg-card-bg p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">{config.name}</h4>
                            <p className="text-xs text-text-muted">{scenarioLabels[config.scenario]}</p>
                          </div>
                        </div>
                        {config.isDefault && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Default
                          </span>
                        )}
                      </div>

                      {config.description && (
                        <p className="text-xs text-text-muted">{config.description}</p>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-muted">Property Agent (A)</span>
                          <span className="font-medium">{config.propertyAgentPercent}%</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-muted">Lead Agent (B)</span>
                          <span className="font-medium">{config.leadAgentPercent}%</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-muted">Company</span>
                          <span className="font-medium">{config.companyPercent}%</span>
                        </div>
                        {/* Visual bar */}
                        <div className="flex h-2 overflow-hidden rounded-full bg-border mt-1">
                          {config.propertyAgentPercent > 0 && (
                            <div
                              className="bg-blue-500"
                              style={{ width: `${config.propertyAgentPercent}%` }}
                            />
                          )}
                          {config.leadAgentPercent > 0 && (
                            <div
                              className="bg-green-500"
                              style={{ width: `${config.leadAgentPercent}%` }}
                            />
                          )}
                          {config.companyPercent > 0 && (
                            <div
                              className="bg-amber-500"
                              style={{ width: `${config.companyPercent}%` }}
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-1 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDrawer(config._id)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setConfigToDelete(config._id); setDeleteConfirmOpen(true); }}
                          title="Delete"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "commissions" && (
          <motion.div
            key="commissions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {dealCommissions === undefined ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : dealCommissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
                <DollarSign className="h-10 w-10 text-text-muted mb-3" />
                <p className="text-sm text-text-muted">No deal commissions yet.</p>
                <p className="text-xs text-text-muted mt-1">
                  Commissions are automatically generated when deals are won with a deal value.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Deal Value</TableHead>
                      <TableHead>Property Agent</TableHead>
                      <TableHead>Lead Agent</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <motion.tbody variants={listVariants} initial="hidden" animate="show">
                    {dealCommissions.map((commission) => (
                      <motion.tr
                        key={commission._id}
                        variants={rowVariants}
                        className="h-11 border-b border-[rgba(148,163,184,0.1)] transition-colors duration-150 hover:bg-row-hover"
                      >
                        <TableCell className="font-medium">{commission.leadName}</TableCell>
                        <TableCell>
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: commission.dealCurrency,
                            minimumFractionDigits: 0,
                          }).format(commission.dealValue)}
                        </TableCell>
                        <TableCell>
                          {commission.propertyAgentName !== "—" ? (
                            <div>
                              <div className="text-sm">{commission.propertyAgentName}</div>
                              <div className="text-xs text-text-muted">
                                {commission.propertyAgentPercent}% = {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: commission.dealCurrency,
                                  minimumFractionDigits: 0,
                                }).format(commission.propertyAgentAmount)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="text-sm">{commission.leadAgentName}</div>
                            <div className="text-xs text-text-muted">
                              {commission.leadAgentPercent}% = {new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: commission.dealCurrency,
                                minimumFractionDigits: 0,
                              }).format(commission.leadAgentAmount)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-text-muted">
                            {commission.companyPercent}% = {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: commission.dealCurrency,
                              minimumFractionDigits: 0,
                            }).format(commission.companyAmount)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {commission.status === "pending" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <Clock className="h-3 w-3" /> Pending
                            </span>
                          )}
                          {commission.status === "approved" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              <CheckCircle className="h-3 w-3" /> Approved
                            </span>
                          )}
                          {commission.status === "paid" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              <CheckCircle className="h-3 w-3" /> Paid
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Select
                            value={commission.status}
                            onChange={(e) => handleStatusChange(commission._id, e.target.value as CommissionStatus)}
                            className="h-8 w-28 text-xs"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                          </Select>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                </Table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create/Edit Drawer */}
      <RightDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingConfig ? "Edit Commission Scenario" : "New Commission Scenario"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingConfig ? "Save Changes" : "Create Scenario"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && drawerOpen && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="e.g., Standard Shared Deal"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Scenario Type</Label>
            {editingConfig ? (
              <Input value={scenarioLabels[formData.scenario]} readOnly className="bg-surface-2" />
            ) : (
              <Select
                value={formData.scenario}
                onChange={(e) => setFormData((prev) => ({ ...prev, scenario: e.target.value as Scenario }))}
              >
                <option value="shared_deal">Shared Deal</option>
                <option value="own_property_own_lead">Own Property & Own Lead</option>
                <option value="company_property">Company Property</option>
              </Select>
            )}
            <p className="text-xs text-text-muted">{scenarioDescriptions[formData.scenario]}</p>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe when this scenario applies..."
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="text-sm font-medium">Commission Split</h4>
            <p className="text-xs text-text-muted">Percentages must sum to 100%</p>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Property Agent (A) %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.propertyAgentPercent}
                    onChange={(e) => handlePercentChange("propertyAgentPercent", e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Lead Agent (B) %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.leadAgentPercent}
                    onChange={(e) => handlePercentChange("leadAgentPercent", e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Company %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.companyPercent}
                    onChange={(e) => handlePercentChange("companyPercent", e.target.value)}
                  />
                </div>
              </div>

              {/* Visual bar + total */}
              <div className="flex h-3 overflow-hidden rounded-full bg-border">
                {(parseFloat(formData.propertyAgentPercent) || 0) > 0 && (
                  <div className="bg-blue-500 transition-all duration-300" style={{ width: `${parseFloat(formData.propertyAgentPercent) || 0}%` }} />
                )}
                {(parseFloat(formData.leadAgentPercent) || 0) > 0 && (
                  <div className="bg-green-500 transition-all duration-300" style={{ width: `${parseFloat(formData.leadAgentPercent) || 0}%` }} />
                )}
                {(parseFloat(formData.companyPercent) || 0) > 0 && (
                  <div className="bg-amber-500 transition-all duration-300" style={{ width: `${parseFloat(formData.companyPercent) || 0}%` }} />
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Agent A</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Agent B</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Company</span>
                </div>
                <span className={`font-medium ${Math.abs(percentTotal - 100) > 0.01 ? "text-danger" : "text-green-600"}`}>
                  Total: {percentTotal}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={(e) => setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="isDefault" className="cursor-pointer">
              Set as default for this scenario
            </Label>
          </div>
        </div>
      </RightDrawer>

      {/* Delete Confirmation */}
      <Modal
        open={deleteConfirmOpen}
        title="Delete Commission Scenario"
        description={`Are you sure you want to delete "${configToDeleteName}"?`}
        onClose={() => { setDeleteConfirmOpen(false); setConfigToDelete(null); }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setDeleteConfirmOpen(false); setConfigToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting} className="attention-shake">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Scenario
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          This will permanently remove this commission split scenario. If any deals have used this config, you will not be able to delete it.
        </p>
      </Modal>
    </div>
  );
}
