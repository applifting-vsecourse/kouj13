import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { Seo } from "@/components/Seo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { profileQueryOptions } from "@/lib/profile"

import { SettingsForm } from "@/features/settings/components/SettingsForm"

export const Route = createFileRoute("/_ProtectedPages/settings")({ component: SettingsPage })

function SettingsPage() {
  const profile = useQuery(profileQueryOptions())
  return (
    <>
      <Seo title="Settings" />
      <section className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mb-8 text-muted-foreground">
          Choose how people see you and how your new posts start.
        </p>
        {profile.isPending ? (
          <p role="status">Loading settings…</p>
        ) : profile.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {profile.error.message}
              <Button
                variant="outline"
                onClick={() => void profile.refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <SettingsForm profile={profile.data} />
        )}
      </section>
    </>
  )
}
