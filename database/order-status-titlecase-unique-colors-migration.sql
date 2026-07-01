UPDATE order_statuses
SET name = CASE LOWER(name)
    WHEN 'new' THEN 'New'
    WHEN 'editing' THEN 'Editing'
    WHEN 'editing done' THEN 'Editing Done'
    WHEN 'editing sent' THEN 'Editing Sent'
    WHEN 'correction' THEN 'Correction'
    WHEN 'correction done' THEN 'Correction Done'
    WHEN 'address received' THEN 'Address Received'
    WHEN 'order confirmed' THEN 'Order Confirmed'
    WHEN 'billing done' THEN 'Billing Done'
    WHEN 'save' THEN 'Save'
    WHEN 'save done' THEN 'Save Done'
    WHEN 'on printing' THEN 'On Printing'
    WHEN 'printing done' THEN 'Printing Done'
    WHEN 'issued for production' THEN 'Issued For Production'
    WHEN 'collected by night branch' THEN 'Collected By Night Branch'
    WHEN 'collected by warehouse' THEN 'Collected By Warehouse'
    WHEN 'collecting by kb' THEN 'Collecting By Kb'
    WHEN 'production ongoing' THEN 'Production Ongoing'
    WHEN 'issued for transport lorry/wheel' THEN 'Issued For Transport Lorry/Wheel'
    WHEN 'order processing' THEN 'Order Processing'
    WHEN 'order reschedule 01' THEN 'Order Reschedule 01'
    WHEN 'order reschedule 02' THEN 'Order Reschedule 02'
    WHEN 'order reschedule 03' THEN 'Order Reschedule 03'
    WHEN 'complete' THEN 'Complete'
    WHEN 'completed' THEN 'Complete'
    WHEN 'returned' THEN 'Returned'
    WHEN 'return' THEN 'Returned'
    ELSE name
  END,
  color = CASE LOWER(name)
    WHEN 'new' THEN '#0EA5E9'
    WHEN 'editing' THEN '#10B981'
    WHEN 'editing done' THEN '#8B5CF6'
    WHEN 'editing sent' THEN '#06B6D4'
    WHEN 'correction' THEN '#F59E0B'
    WHEN 'correction done' THEN '#84CC16'
    WHEN 'address received' THEN '#2563EB'
    WHEN 'order confirmed' THEN '#14B8A6'
    WHEN 'billing done' THEN '#F97316'
    WHEN 'save' THEN '#A855F7'
    WHEN 'save done' THEN '#6366F1'
    WHEN 'on printing' THEN '#EC4899'
    WHEN 'printing done' THEN '#D946EF'
    WHEN 'issued for production' THEN '#F43F5E'
    WHEN 'collected by night branch' THEN '#EAB308'
    WHEN 'collected by warehouse' THEN '#22C55E'
    WHEN 'collecting by kb' THEN '#0D9488'
    WHEN 'production ongoing' THEN '#0891B2'
    WHEN 'issued for transport lorry/wheel' THEN '#3B82F6'
    WHEN 'order processing' THEN '#7C3AED'
    WHEN 'order reschedule 01' THEN '#D97706'
    WHEN 'order reschedule 02' THEN '#EA580C'
    WHEN 'order reschedule 03' THEN '#DB2777'
    WHEN 'complete' THEN '#16A34A'
    WHEN 'completed' THEN '#16A34A'
    WHEN 'returned' THEN '#DC2626'
    WHEN 'return' THEN '#DC2626'
    ELSE color
  END,
  sort_order = CASE LOWER(name)
    WHEN 'new' THEN 1
    WHEN 'editing' THEN 2
    WHEN 'editing done' THEN 3
    WHEN 'editing sent' THEN 4
    WHEN 'correction' THEN 5
    WHEN 'correction done' THEN 6
    WHEN 'address received' THEN 7
    WHEN 'order confirmed' THEN 8
    WHEN 'billing done' THEN 9
    WHEN 'save' THEN 10
    WHEN 'save done' THEN 11
    WHEN 'on printing' THEN 12
    WHEN 'printing done' THEN 13
    WHEN 'issued for production' THEN 14
    WHEN 'collected by night branch' THEN 15
    WHEN 'collected by warehouse' THEN 16
    WHEN 'collecting by kb' THEN 17
    WHEN 'production ongoing' THEN 18
    WHEN 'issued for transport lorry/wheel' THEN 19
    WHEN 'order processing' THEN 20
    WHEN 'order reschedule 01' THEN 21
    WHEN 'order reschedule 02' THEN 22
    WHEN 'order reschedule 03' THEN 23
    WHEN 'complete' THEN 24
    WHEN 'completed' THEN 24
    WHEN 'returned' THEN 25
    WHEN 'return' THEN 25
    ELSE sort_order
  END,
  is_final = CASE
    WHEN LOWER(name) IN ('complete', 'completed', 'returned', 'return') THEN TRUE
    ELSE is_final
  END,
  is_active = TRUE
WHERE LOWER(name) IN (
  'new', 'editing', 'editing done', 'editing sent', 'correction', 'correction done',
  'address received', 'order confirmed', 'billing done', 'save', 'save done',
  'on printing', 'printing done', 'issued for production', 'collected by night branch',
  'collected by warehouse', 'collecting by kb', 'production ongoing',
  'issued for transport lorry/wheel', 'order processing', 'order reschedule 01',
  'order reschedule 02', 'order reschedule 03', 'complete', 'completed',
  'returned', 'return'
);
