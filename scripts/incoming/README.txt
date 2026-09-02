Drop the month's fresh export here before running the refresh script
(refresh_monthly.bat on Windows, refresh_monthly.sh on Mac/Linux).

Accepted file types: .xlsx or .csv
Required columns: Client, Ticket ID, Date (Created), Category,
Contact Type, Solution, Mailbox 2, Quarter

The refresh script automatically picks the most recently modified
file in this folder, so it's fine to leave old exports here too --
just make sure the new one is the newest file.
