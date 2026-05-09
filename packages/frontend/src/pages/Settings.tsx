import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Badge } from "@/components/ui/badge.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.js";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Manage your practice, payers, and integrations</p>
      </div>

      <Tabs defaultValue="practice">
        <TabsList>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="payers">Payers</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="practice">
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Practice Information</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Practice Name
                  </label>
                  <Input defaultValue="Summit Physical Therapy" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    NPI Number
                  </label>
                  <Input defaultValue="1234567890" className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Tax ID (EIN)
                  </label>
                  <Input defaultValue="XX-XXXXXXX" className="font-mono" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <Input defaultValue="(555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Address
                </label>
                <Input defaultValue="123 Healthcare Blvd, Suite 200, Raleigh, NC 27601" />
              </div>
              <div className="pt-2">
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payers">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Connected Payers</h3>
                <Button variant="outline" size="sm">Add Payer</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "UnitedHealthcare", id: "87726", status: "connected", x278: true, fhir: false },
                  { name: "Aetna", id: "60054", status: "connected", x278: true, fhir: false },
                  { name: "Anthem BCBS", id: "47198", status: "connected", x278: true, fhir: true },
                  { name: "Cigna", id: "62308", status: "pending", x278: true, fhir: false },
                  { name: "Humana", id: "61101", status: "connected", x278: true, fhir: false },
                  { name: "Medicare", id: "00882", status: "connected", x278: true, fhir: true },
                ].map((payer) => (
                  <div
                    key={payer.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="font-medium text-slate-900">{payer.name}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          EDI: {payer.id}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {payer.x278 && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          X12 278
                        </span>
                      )}
                      {payer.fhir && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          FHIR R4
                        </span>
                      )}
                      <Badge variant={payer.status === "connected" ? "approved" : "pending"}>
                        {payer.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">EMR / EHR Integrations</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "WebPT", status: "available", description: "Import patient data and clinical notes" },
                  { name: "Prompt EMR", status: "coming_soon", description: "Bi-directional sync with Prompt" },
                  { name: "TheraOffice", status: "coming_soon", description: "Patient and scheduling import" },
                  { name: "Clinicient / WebPT Enterprise", status: "coming_soon", description: "Enterprise integration" },
                ].map((integration) => (
                  <div
                    key={integration.name}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{integration.name}</span>
                      <p className="text-xs text-slate-500">{integration.description}</p>
                    </div>
                    {integration.status === "available" ? (
                      <Button variant="outline" size="sm">Connect</Button>
                    ) : (
                      <Badge variant="draft">Coming Soon</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <h3 className="font-medium text-slate-900">Clearinghouse</h3>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <span className="font-medium text-slate-900">Availity</span>
                  <p className="text-xs text-slate-500">
                    Primary clearinghouse for X12 278 transactions
                  </p>
                </div>
                <Badge variant="approved">Connected</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Subscription</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-blue-900">Practice Plan</h4>
                    <p className="text-sm text-blue-700">3-8 providers · 80 PAs included/month</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-blue-900">$399</span>
                    <span className="text-sm text-blue-600">/mo</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-2xl font-bold text-slate-900">47</div>
                  <div className="text-xs text-slate-500">PAs this month</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-2xl font-bold text-slate-900">33</div>
                  <div className="text-xs text-slate-500">Remaining included</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-2xl font-bold text-green-600">$0</div>
                  <div className="text-xs text-slate-500">Overage charges</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
