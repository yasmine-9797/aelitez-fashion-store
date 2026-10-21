import { Link } from "@tanstack/react-router";
import { BadgeCheck, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { reviewSchema } from "@shared/validation";
import { isApiError } from "@/lib/api";
import { useCreateReview, useMe, useReviewEligibility, useReviews } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Alert, Button, Container, SectionHead, TextAreaField, TextField } from "./ui";

export function ProductReviews({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const reviews = useReviews(slug, page);
  const me = useMe();
  const eligibility = useReviewEligibility(slug, Boolean(me.data));
  const summary = reviews.data?.summary;
  const count = summary?.ratingCount ?? 0;

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="border-t py-16 md:py-24">
      <Container>
        <SectionHead id="reviews-title" eyebrow="Verified reviews" title="What customers say" note="Only customers who received this product can review it." />
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            {count > 0 && summary?.ratingAvg != null ? (
              <>
                <p className="display text-7xl">{summary.ratingAvg.toFixed(1)}</p>
                <p className="mt-1 text-brand" aria-hidden>
                  {"★".repeat(Math.round(summary.ratingAvg))}
                  <span className="text-muted">{"★".repeat(5 - Math.round(summary.ratingAvg))}</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary.ratingAvg.toFixed(1)} out of 5 · {count} review{count === 1 ? "" : "s"}
                </p>
                <ul className="mt-6 space-y-2">
                  {summary.distribution.map((d) => (
                    <li key={d.star} className="flex items-center gap-3 text-sm">
                      <span className="w-8">{d.star}★</span>
                      <span className="h-2 flex-1 bg-muted">
                        <span className="block h-full bg-brand" style={{ width: `${count ? (d.count / count) * 100 : 0}%` }} />
                      </span>
                      <span className="w-6 text-right text-muted-foreground">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">No reviews yet. Reviews appear here once customers have received this product.</p>
            )}
            <div className="mt-8">
              {!me.data ? (
                <p className="text-sm">
                  Bought this?{" "}
                  <Link to="/login" search={{ redirect: `/products/${slug}` }} className="font-semibold text-brand underline underline-offset-4">
                    Sign in
                  </Link>{" "}
                  to review it.
                </p>
              ) : eligibility.data?.canReview ? (
                <ReviewForm slug={slug} />
              ) : eligibility.data?.reason ? (
                <p className="text-sm text-muted-foreground">{eligibility.data.reason}</p>
              ) : null}
            </div>
          </div>
          <div className="lg:col-span-8">
            <ul className="divide-y">
              {reviews.data?.reviews.map((r) => (
                <li key={r.id} className="py-6 first:pt-0">
                  <p className="text-brand" aria-label={`${r.rating} out of 5 stars`}>
                    {"★".repeat(r.rating)}
                    <span className="text-muted">{"★".repeat(5 - r.rating)}</span>
                  </p>
                  {r.title && <p className="mt-2 font-bold">{r.title}</p>}
                  <p className="mt-2 text-muted-foreground">{r.body}</p>
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <span className="font-semibold">{r.authorName}</span>
                    {r.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
                        <BadgeCheck className="size-4 text-brand" aria-hidden /> Verified purchase
                      </span>
                    )}
                    <span className="text-muted-foreground">· {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </p>
                </li>
              ))}
            </ul>
            {reviews.data && reviews.data.meta.totalPages > 1 && (
              <div className="mt-6 flex gap-3">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Newer
                </Button>
                <Button variant="outline" size="sm" disabled={page >= reviews.data.meta.totalPages} onClick={() => setPage(page + 1)}>
                  Older
                </Button>
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

function ReviewForm({ slug }: { slug: string }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateReview(slug);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = reviewSchema.safeParse({ rating, title: title || undefined, body });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: () => toast.success("Thanks — your review is live."),
      onError: (err) => toast.error(isApiError(err) ? err.message : "Couldn't post your review."),
    });
  };
  return (
    <form method="post" onSubmit={submit} className="space-y-4 border p-5" noValidate>
      <p className="font-bold">Write a review</p>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={rating === n} className="p-1">
              <Star className={cn("size-6", n <= rating ? "fill-brand text-brand" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
        {errors["rating"] && <p className="mt-1 text-xs font-semibold text-brand">{errors["rating"]}</p>}
      </fieldset>
      <TextField label="Title" optional value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} error={errors["title"]} />
      <TextAreaField label="Your review" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} error={errors["body"]} hint="How was the fit, fabric and colour?" />
      {create.isError && <Alert tone="error">{isApiError(create.error) ? create.error.message : "Something went wrong."}</Alert>}
      <Button type="submit" loading={create.isPending}>
        Post review
      </Button>
    </form>
  );
}
