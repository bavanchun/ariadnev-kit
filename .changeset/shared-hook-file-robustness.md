---
"ariadnev": patch
---

The writers that share a hooks file with other tools are harder to fool.

Ownership is decided by the file a command runs, not by whether its text
mentions our install directory. A guard that excludes our hooks from its own
scan carries that directory as an argument, and the old substring test read it
as ours — so an uninstall would have taken that tool's entry out of a file four
writers share, with no receipt naming it, and a reinstall would have rebuilt
over it. The same test governs the statusline slot, where being wrong meant
replacing one the user had chosen. A sibling directory sharing our prefix,
`…/hooks/av-legacy` beside `…/hooks/av`, is no longer read as a file inside
ours.

A hooks file whose bytes parse but whose shape is not the provider's is now
refused before the caller writes, the same answer these mergers already gave to
bytes they could not parse at all. A JSON array accepts the registration as a
named property and then loses it at stringify time, which would have reported
hooks installed into a file that carries none of them; a string root threw a
raw TypeError instead of saying anything about the user's file. An event whose
value is not a list of groups is named in the error rather than aborting the
install with a stack trace.

Declining the hook merge prints one block per registry, not one block. Three
providers keep hooks in three different files now and a single run can select
all of them, so naming only the first left the rest on disk, unregistered, with
nothing in the output saying which. Two providers pointed at one file still get
one block, because that is one file to edit.
