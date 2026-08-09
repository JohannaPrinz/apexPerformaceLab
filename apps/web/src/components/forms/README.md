# forms

Form primitives and composed field components: labelled fields, validation
message display, form sections, submit bars.

Forms are Zod-validated against the schema in the owning feature slice — the
same schema the Server Action uses, so client and server can never disagree
about what is valid.
