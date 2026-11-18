"use client";

// استيراد React للسماح باستخدام JSX
import * as React from "react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

// تعريف مكون الجدول الرئيسي (<table>)
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table
    ref={ref}
    className={cn("w-full caption-bottom text-sm", className)}
    {...props}
  />
))
Table.displayName = "Table"

// تعريف مكون رأس الجدول (<thead>)
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b bg-muted/50", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

// تعريف مكون جسم الجدول (<tbody>) مع دعم التحميل التلقائي بالسحب لأسفل (Infinite Scroll) في وضع الموبايل
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile()
  const [mobileLimit, setMobileLimit] = React.useState(50)
  const sentinelRef = React.useRef<HTMLTableRowElement | null>(null)

  const childArray = React.Children.toArray(children)
  const shouldChunkOnMobile = isMobile && childArray.length > 50

  React.useEffect(() => {
    if (!shouldChunkOnMobile || mobileLimit >= childArray.length) return
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMobileLimit((prev) => Math.min(childArray.length, prev + 50))
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [shouldChunkOnMobile, mobileLimit, childArray.length])

  const renderedChildren = shouldChunkOnMobile ? childArray.slice(0, mobileLimit) : children

  return (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    >
      {renderedChildren}
      {shouldChunkOnMobile && mobileLimit < childArray.length && (
        <tr ref={sentinelRef} className="border-0">
          <td colSpan={99} className="py-3 text-center text-xs text-muted-foreground">
            جاري تحميل المزيد عند السحب لأسفل ({mobileLimit} / {childArray.length})...
          </td>
        </tr>
      )}
    </tbody>
  )
})
TableBody.displayName = "TableBody"

// تعريف مكون تذييل الجدول (<tfoot>)
const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

// تعريف مكون صف الجدول (<tr>)
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

// تعريف مكون خلية رأس الجدول (<th>)
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

// تعريف مكون خلية الجدول (<td>)
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

// تعريف مكون تسمية الجدول (<caption>)
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

// تصدير جميع المكونات للاستخدام
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
